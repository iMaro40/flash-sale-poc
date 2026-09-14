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
import { TransactionStatus } from "../transactions/model";
import { TransactionRepository } from "../transactions/repository";
import type { PurchaseProductInput } from "./dto/purchase-product";

export class PurchaseService {
  public constructor(
    private readonly db: Knex,
    private readonly productService: ProductService,
    private readonly flashSaleService: FlashSaleService,
  ) {}

  public async purchaseProduct(input: PurchaseProductInput): Promise<void> {
    const shouldProceed = await this.reserveStock(input);

    if (!shouldProceed) {
      return;
    }

    try {
      await this.db.transaction(
        async (trx: Knex.Transaction): Promise<void> => {
          const transactionRepository: TransactionRepository =
            new TransactionRepository(trx);
          const productRepository: ProductRepository = new ProductRepository(
            trx,
          );

          const transaction =
            await transactionRepository.createPendingTransaction({
              idempotencyKey: input.idempotencyKey,
              productId: input.productId,
              userId: input.userId,
            });

          const updatedRows = await productRepository.decrementStockByProductId(
            input.productId,
          );

          if (updatedRows === 0) {
            throw new OutOfStockError(input.productId);
          }

          await transactionRepository.updateTransactionStatusById(
            transaction.id,
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
          console.error("Failed to release rolled-back reservation", releaseError);
        }
      } else {
        console.error(
          "Database transaction outcome is unknown. Need to reconcile inventory.",
          { productId: input.productId, idempotencyKey: input.idempotencyKey, error },
        );
      }
      throw error;
    }

    await this.productService.markStockReservationAsCompleted({
      productId: input.productId,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
    });
    await this.productService.deleteProductDetailsCache(input.productId);

    // OUT OF SCOPE: Publish to queue for post-purchase asynchronous side effects e.g. notifications, email, analytics, etc.
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
