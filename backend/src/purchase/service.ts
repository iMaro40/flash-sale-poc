import type { Channel } from "amqplib";
import type { Knex } from "knex";

import { database } from "../database";
import { ActiveFlashSaleNotFoundError } from "../errors/active-flash-sale-not-found";
import { DuplicateTransactionError } from "../errors/duplicate-transaction";
import { OutOfStockError } from "../errors/out-of-stock";
import { ProductAlreadyPurchasedError } from "../errors/product-already-purchased";
import { ProductNotFoundError } from "../errors/product-not-found";
import { RedisUnavailableError } from "../errors/redis-unavailable";
import { TransactionInProgressError } from "../errors/transaction-in-progress";
import { flashSaleService, FlashSaleService } from "../flash-sale/service";
import { FlashSaleRepository } from "../flash-sale/repository";
import { StockReservationStatus } from "../product/dto/reserve-stock";
import { ProductRepository } from "../product/repository";
import { productService, ProductService } from "../product/service";
import { getPublishChannel } from "../rabbitmq";
import { PURCHASE_QUEUE } from "../rabbitmq/queues";
import { TransactionStatus } from "../transactions/model";
import { TransactionRepository } from "../transactions/repository";
import { PurchaseAcceptanceStatus } from "./dto/purchase-acceptance";
import type { QueuedPurchase } from "./dto/queued-purchase";
import type { PurchaseProductInput } from "./dto/purchase-product";

export class PurchaseService {
  public constructor(
    private readonly db: Knex,
    private readonly productService: ProductService,
    private readonly flashSaleService: FlashSaleService,
    private readonly getChannel: () => Channel = getPublishChannel,
    private readonly transactionRepository: TransactionRepository = new TransactionRepository(
      db,
    ),
    private readonly productRepository: ProductRepository = new ProductRepository(
      db,
    ),
    private readonly flashSaleRepository: FlashSaleRepository = new FlashSaleRepository(
      db,
    ),
  ) {}

  // Reserves stock synchronously (fast, Redis-only), then hands the actual DB
  // write off to RabbitMQ so Postgres write throughput is limited by how many
  // messages the worker processes at once, instead of raw HTTP request volume.
  public async purchaseProduct(
    input: PurchaseProductInput,
  ): Promise<PurchaseAcceptanceStatus> {
    let shouldProceed: boolean;
    try {
      shouldProceed = await this.reserveStock(input);
    } catch (error) {
      if (!(error instanceof RedisUnavailableError)) {
        throw error;
      }

      return this.purchaseUsingDatabaseFallback(input);
    }

    if (!shouldProceed) {
      return PurchaseAcceptanceStatus.ALREADY_COMPLETED;
    }

    try {
      return await this.enqueuePurchase(input);
    } catch (error) {
      await this.handleEnqueueFailure(error, input);
      throw error;
    }
  }

  // A definitive DB failure (e.g. constraint violation) never left a transaction row behind,
  // so the reconciler can't find it; release the reservation now instead of stranding it.
  private async handleEnqueueFailure(
    error: unknown,
    input: PurchaseProductInput,
  ): Promise<void> {
    if (!this.isDefinitiveRollback(error)) {
      console.error(
        "Enqueue outcome is unknown. Need to reconcile inventory.",
        {
          productId: input.productId,
          idempotencyKey: input.idempotencyKey,
          error,
        },
      );
      return;
    }

    await this.releaseRolledBackReservation(input);
  }

  private async enqueuePurchase(
    input: PurchaseProductInput,
  ): Promise<PurchaseAcceptanceStatus> {
    const transaction =
      await this.transactionRepository.createPendingTransaction(input);
    const channel = this.getChannel();
    const queuedPurchase: QueuedPurchase = {
      transactionId: transaction.id,
      input,
    };
    // IMPORTANT: Best pattern here is to use transactional outbox so that creating a pending transaction + publishing can be treated as atomic
    // Did not end up implementing this for this assignment. For this assignment, just assume publish always succeeds
    channel.sendToQueue(
      PURCHASE_QUEUE,
      Buffer.from(JSON.stringify(queuedPurchase)),
      { persistent: true },
    );

    return PurchaseAcceptanceStatus.ACCEPTED;
  }

  // If Redis is down, we query the DB directly to determine if the purchase can proceed
  // This is only meant to be last resort since this is not performant
  private async purchaseUsingDatabaseFallback(
    input: PurchaseProductInput,
  ): Promise<PurchaseAcceptanceStatus> {
    const activeFlashSale =
      await this.flashSaleRepository.findActiveFlashSaleByProductId(
        input.productId,
        new Date(),
      );
    if (!activeFlashSale) {
      throw new ActiveFlashSaleNotFoundError(input.productId);
    }

    const product = await this.productRepository.findById(input.productId);
    if (!product) {
      throw new ProductNotFoundError(input.productId);
    }
    if (product.stock <= 0) {
      throw new OutOfStockError(input.productId);
    }

    const existingByIdempotency =
      await this.transactionRepository.getTransactionByIdempotencyKeyAndUserId(
        input.idempotencyKey,
        input.userId,
      );
    if (existingByIdempotency) {
      if (existingByIdempotency.status === TransactionStatus.COMPLETED) {
        return PurchaseAcceptanceStatus.ALREADY_COMPLETED;
      }

      throw new DuplicateTransactionError(input.idempotencyKey);
    }

    const existingByProduct =
      await this.transactionRepository.getTransactionByUserIdAndProductId(
        input.userId,
        input.productId,
      );
    if (existingByProduct) {
      if (existingByProduct.status === TransactionStatus.COMPLETED) {
        throw new ProductAlreadyPurchasedError(input.userId, input.productId);
      }

      throw new TransactionInProgressError(input.productId);
    }

    try {
      return await this.enqueuePurchase(input);
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) {
        throw error;
      }

      return this.resolveDatabaseDuplicate(input);
    }
  }

  private async resolveDatabaseDuplicate(
    input: PurchaseProductInput,
  ): Promise<PurchaseAcceptanceStatus> {
    const existingByIdempotency =
      await this.transactionRepository.getTransactionByIdempotencyKeyAndUserId(
        input.idempotencyKey,
        input.userId,
      );
    if (existingByIdempotency?.status === TransactionStatus.COMPLETED) {
      return PurchaseAcceptanceStatus.ALREADY_COMPLETED;
    }
    if (existingByIdempotency) {
      throw new DuplicateTransactionError(input.idempotencyKey);
    }

    const existingByProduct =
      await this.transactionRepository.getTransactionByUserIdAndProductId(
        input.userId,
        input.productId,
      );
    if (existingByProduct?.status === TransactionStatus.COMPLETED) {
      throw new ProductAlreadyPurchasedError(input.userId, input.productId);
    }
    if (existingByProduct) {
      throw new TransactionInProgressError(input.productId);
    }

    throw new Error("Transaction uniqueness conflict could not be resolved");
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return this.getErrorCode(error) === "23505";
  }

  // Performs the actual DB write for a reserved purchase. Called by the purchase worker
  // after consuming the message published in purchaseProduct().
  public async completePurchase(
    input: PurchaseProductInput,
    transactionId: string,
  ): Promise<void> {
    try {
      await this.db.transaction((trx: Knex.Transaction) =>
        this.completePurchaseTransaction(trx, input, transactionId),
      );
    } catch (error) {
      await this.handlePurchaseCompletionError(error, input);
      throw error;
    }

    await this.markReservationAsCompleted(input);

    // OUT OF SCOPE: Publish to queue for post-purchase asynchronous side effects e.g. notifications, email, analytics, etc.
  }

  public async cancelPurchase(
    transactionId: string,
    input: PurchaseProductInput,
  ): Promise<void> {
    const cancelled =
      await this.transactionRepository.cancelPendingTransactionById(
        transactionId,
      );

    if (cancelled) {
      await this.productService.releaseStockByProductId(input);
    }
  }

  private async completePurchaseTransaction(
    trx: Knex.Transaction,
    input: PurchaseProductInput,
    transactionId: string,
  ): Promise<void> {
    const transactionRepository: TransactionRepository =
      new TransactionRepository(trx);
    const productRepository: ProductRepository = new ProductRepository(trx);
    // Lock the transaction row so duplicate deliveries or retries
    // cannot decrement stock more than once.
    const transaction = await transactionRepository.getTransactionById(
      transactionId,
      true,
    );

    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }
    // Important checks to prevent retries from incorrectly decrementing stock
    if (transaction.status === TransactionStatus.COMPLETED) {
      return;
    }
    if (transaction.status === TransactionStatus.CANCELLED) {
      throw new Error(`Transaction already cancelled: ${transactionId}`);
    }

    const updatedRows = await productRepository.decrementStockByProductId(
      input.productId,
    );
    if (updatedRows === 0) {
      throw new OutOfStockError(input.productId);
    }

    await transactionRepository.updateTransactionStatusById(
      transactionId,
      TransactionStatus.COMPLETED,
    );
  }

  private async handlePurchaseCompletionError(
    error: unknown,
    input: PurchaseProductInput,
  ): Promise<void> {
    if (this.isDefinitiveRollback(error)) {
      await this.releaseRolledBackReservation(input);
      return;
    }

    console.error(
      "Database transaction outcome is unknown. Need to reconcile inventory.",
      {
        productId: input.productId,
        idempotencyKey: input.idempotencyKey,
        error,
      },
    );
  }

  private isDefinitiveRollback(error: unknown): boolean {
    const code = this.getErrorCode(error);
    return error instanceof OutOfStockError || code.startsWith("23");
  }

  private getErrorCode(error: unknown): string {
    return error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  }

  private async releaseRolledBackReservation(
    input: PurchaseProductInput,
  ): Promise<void> {
    try {
      await this.productService.releaseStockByProductId(input);
    } catch (releaseError) {
      console.error("Failed to release rolled-back reservation", releaseError);
    }
  }

  private async markReservationAsCompleted(
    input: PurchaseProductInput,
  ): Promise<void> {
    try {
      await this.productService.markStockReservationAsCompleted({
        productId: input.productId,
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      console.error("Failed to mark stock reservation as completed", error);
    }
  }

  private async reserveStock(input: PurchaseProductInput): Promise<boolean> {
    let reservation = await this.productService.reserveStockByProductId(input);

    if (
      reservation.status === StockReservationStatus.FLASH_SALE_CACHE_MISSING
    ) {
      // Cache flash sale data and try to reserve again
      const activeFlashSale =
        await this.flashSaleService.findActiveFlashSaleByProductId(
          input.productId,
        );

      if (!activeFlashSale) {
        throw new ActiveFlashSaleNotFoundError(input.productId);
      }

      reservation = await this.productService.reserveStockByProductId(input);
    }

    // Only proceeds if stock is successfully reserved
    switch (reservation.status) {
      case StockReservationStatus.RESERVED:
        return true;
      case StockReservationStatus.IDEMPOTENT_SUCCESS:
        return false;
      case StockReservationStatus.DUPLICATE_TRANSACTION:
        throw new DuplicateTransactionError(input.idempotencyKey);
      case StockReservationStatus.TRANSACTION_IN_PROGRESS:
        throw new TransactionInProgressError(input.productId);
      case StockReservationStatus.ALREADY_PURCHASED:
        throw new ProductAlreadyPurchasedError(input.userId, input.productId);
      case StockReservationStatus.OUT_OF_STOCK:
        throw new OutOfStockError(input.productId);
      case StockReservationStatus.PRODUCT_CACHE_MISSING:
        throw new ProductNotFoundError(input.productId);
      case StockReservationStatus.FLASH_SALE_CACHE_MISSING:
      case StockReservationStatus.SALE_INACTIVE:
        throw new ActiveFlashSaleNotFoundError(input.productId);
      default:
        throw new Error(
          `Unhandled stock reservation status: ${reservation.status}`,
        );
    }
  }
}

export const purchaseService: PurchaseService = new PurchaseService(
  database,
  productService,
  flashSaleService,
);
