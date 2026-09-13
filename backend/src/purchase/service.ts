import type { Knex } from "knex";

import { database } from "../database";
import { ActiveFlashSaleNotFoundError } from "../errors/active-flash-sale-not-found";
import { DuplicateTransactionError } from "../errors/duplicate-transaction";
import { OutOfStockError } from "../errors/out-of-stock";
import { ProductAlreadyPurchasedError } from "../errors/product-already-purchased";
import { ProductNotFoundError } from "../errors/product-not-found";
import { TransactionInProgressError } from "../errors/transaction-in-progress";
import { flashSaleService, FlashSaleService } from "../flash-sale/service";
import { ProductRepository } from "../product/repository";
import { productService, ProductService } from "../product/service";
import { TransactionStatus } from "../transactions/model";
import { TransactionRepository } from "../transactions/repository";
import {
  transactionService,
  TransactionService,
} from "../transactions/service";
import type { PurchaseProductInput } from "./dto/purchase-product";

export class PurchaseService {
  public constructor(
    private readonly db: Knex,
    private readonly productService: ProductService,
    private readonly flashSaleService: FlashSaleService,
    private readonly transactionService: TransactionService,
  ) {}

  public async purchaseProduct(input: PurchaseProductInput): Promise<void> {
    const shouldProceed = await this.validatePurchaseProduct(input);

    if (!shouldProceed) {
      return;
    }

    const remainingCacheStock =
      await this.productService.reserveStockByProductId({
        productId: input.productId,
        userId: input.userId,
        idempotencyKey: input.idempotencyKey,
      });

    if (remainingCacheStock !== undefined && remainingCacheStock < 0) {
      throw new OutOfStockError(input.productId);
    }

    // NOTE: The CANCELED status for a transaction is more for when dealing with external payment providers
    // In this assignment, we only mark transactions as COMPLETED after successfully decrementing stock

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
      if (remainingCacheStock !== undefined) {
        await this.productService.releaseStockByProductId({
          productId: input.productId,
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
        });
      }
      throw error;
    }

    await this.productService.deleteProductCache(input.productId);

    // OUT OF SCOPE: Publish to queue for post-purchase asynchronous side effects e.g. notifications, email, analytics, etc.
  }

  private async validatePurchaseProduct(
    input: PurchaseProductInput,
  ): Promise<boolean> {
    const activeFlashSale =
      await this.flashSaleService.findActiveFlashSaleByProductId(
        input.productId,
      );

    if (!activeFlashSale) {
      throw new ActiveFlashSaleNotFoundError(input.productId);
    }

    const product = await this.productService.getProductById(input.productId);

    if (!product) {
      throw new ProductNotFoundError(input.productId);
    }

    if (product.stock <= 0) {
      throw new OutOfStockError(input.productId);
    }

    return this.validateTransaction(input);
  }

  private async validateTransaction(
    input: PurchaseProductInput,
  ): Promise<boolean> {
    const existingTransaction =
      await this.transactionService.getTransactionByUserIdAndProductId(
        input.userId,
        input.productId,
      );

    if (!existingTransaction) {
      return true;
    }

    if (existingTransaction.status === TransactionStatus.COMPLETED) {
      if (existingTransaction.idempotencyKey === input.idempotencyKey) {
        // An existing COMPLETED transaction already exists so return false to indicate idempotent success.
        return false;
      }

      throw new ProductAlreadyPurchasedError(input.userId, input.productId);
    }

    if (existingTransaction.status === TransactionStatus.PENDING) {
      if (existingTransaction.idempotencyKey === input.idempotencyKey) {
        throw new DuplicateTransactionError(input.idempotencyKey);
      }

      throw new TransactionInProgressError(input.productId);
    }

    if (existingTransaction.status === TransactionStatus.FAILED) {
      // TODO: Handle retry logic for failed transactions
      return true;
    }

    return true;
  }
}

export const purchaseService: PurchaseService = new PurchaseService(
  database,
  productService,
  flashSaleService,
  transactionService,
);
