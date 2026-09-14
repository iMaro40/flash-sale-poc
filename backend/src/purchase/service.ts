import type { Channel } from "amqplib";
import type { Knex } from "knex";

import { database } from "../database";
import { ActiveFlashSaleNotFoundError } from "../errors/active-flash-sale-not-found";
import { DuplicateTransactionError } from "../errors/duplicate-transaction";
import { OutOfStockError } from "../errors/out-of-stock";
import { ProductAlreadyPurchasedError } from "../errors/product-already-purchased";
import { ProductNotFoundError } from "../errors/product-not-found";
import { TransactionInProgressError } from "../errors/transaction-in-progress";
import { flashSaleService, FlashSaleService } from "../flash-sale/service";
import { StockReservationStatus } from "../product/dto/reserve-stock";
import { ProductRepository } from "../product/repository";
import { productService, ProductService } from "../product/service";
import { getPublishChannel } from "../rabbitmq";
import { assertPurchaseQueue, PURCHASE_QUEUE } from "../rabbitmq/queues";
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
  ) {}

  // Reserves stock synchronously (fast, Redis-only), then hands the actual DB
  // write off to RabbitMQ so Postgres write throughput is limited by how many
  // messages the worker processes at once, instead of raw HTTP request volume.
  public async purchaseProduct(
    input: PurchaseProductInput,
  ): Promise<PurchaseAcceptanceStatus> {
    const shouldProceed = await this.reserveStock(input);

    if (!shouldProceed) {
      return PurchaseAcceptanceStatus.ALREADY_COMPLETED;
    }

    const transaction =
      await this.transactionRepository.createPendingTransaction(input);
    const channel = this.getChannel();
    await assertPurchaseQueue(channel);
    const queuedPurchase: QueuedPurchase = {
      transactionId: transaction.id,
      input,
    };
    channel.sendToQueue(
      PURCHASE_QUEUE,
      Buffer.from(JSON.stringify(queuedPurchase)),
      { persistent: true },
    );

    return PurchaseAcceptanceStatus.ACCEPTED;
  }

  // Performs the actual DB write for a reserved purchase. Called by the purchase worker
  // after consuming the message published in purchaseProduct().
  public async completePurchase(
    input: PurchaseProductInput,
    transactionId: string,
  ): Promise<void> {
    try {
      await this.db.transaction(
        async (trx: Knex.Transaction): Promise<void> => {
          const transactionRepository: TransactionRepository =
            new TransactionRepository(trx);
          const productRepository: ProductRepository = new ProductRepository(
            trx,
          );

          const transaction = await transactionRepository.getTransactionById(
            transactionId,
            true,
          );
          if (!transaction) {
            throw new Error(`Transaction not found: ${transactionId}`);
          }
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
        },
      );
    } catch (error) {
      // Only explicit rollback errors prove that returning the reservation is safe.
      // A lost COMMIT acknowledgement can mean the transaction actually succeeded.
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      const rolledBack =
        error instanceof OutOfStockError ||
        code.startsWith("23") ||
        code === "40P01" ||
        code === "40001";

      if (rolledBack) {
        try {
          await this.productService.releaseStockByProductId(input);
        } catch (releaseError) {
          console.error(
            "Failed to release rolled-back reservation",
            releaseError,
          );
        }
      } else {
        console.error(
          "Database transaction outcome is unknown. Need to reconcile inventory.",
          {
            productId: input.productId,
            idempotencyKey: input.idempotencyKey,
            error,
          },
        );
      }
      throw error;
    }

    // We don't want Redis blocking the purchase flow at this point since it's already success, so just alert here
    try {
      await this.productService.markStockReservationAsCompleted({
        productId: input.productId,
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      console.error("Failed to mark stock reservation as completed", error);
    }

    // OUT OF SCOPE: Publish to queue for post-purchase asynchronous side effects e.g. notifications, email, analytics, etc.
  }

  public async cancelPurchase(
    transactionId: string,
    input: PurchaseProductInput,
  ): Promise<void> {
    await this.transactionRepository.updateTransactionStatusById(
      transactionId,
      TransactionStatus.CANCELLED,
    );
    await this.productService.releaseStockByProductId(input);
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
