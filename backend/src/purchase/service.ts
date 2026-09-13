import type { Knex } from "knex";

import { database } from "../database";
import { ActiveFlashSaleNotFoundError } from "../errors/active-flash-sale-not-found";
import { DuplicateTransactionError } from "../errors/duplicate-transaction";
import { OutOfStockError } from "../errors/out-of-stock";
import { ProductAlreadyPurchasedError } from "../errors/product-already-purchased";
import { ProductNotFoundError } from "../errors/product-not-found";
import { TransactionInProgressError } from "../errors/transaction-in-progress";
import { FlashSaleRepository } from "../flash-sale/repository";
import { ProductCache } from "../product/cache";
import { ProductRepository } from "../product/repository";
import { redisClient } from "../redis";
import { TransactionStatus } from "../transactions/model";
import { TransactionRepository } from "../transactions/repository";
import type { PurchaseProductInput } from "./dto/purchase-product";

export class PurchaseService {
  public constructor(
    private readonly db: Knex,
    private readonly productCache: ProductCache = new ProductCache(redisClient),
  ) {}

  public async purchaseProduct(input: PurchaseProductInput): Promise<void> {
    await this.db.transaction(async (trx: Knex.Transaction): Promise<void> => {
      const flashSaleRepository: FlashSaleRepository = new FlashSaleRepository(
        trx,
      );
      const productRepository: ProductRepository = new ProductRepository(trx);
      const transactionRepository: TransactionRepository =
        new TransactionRepository(trx);

      const shouldProceed = await this.validatePurchaseProduct(
        input,
        productRepository,
        flashSaleRepository,
        transactionRepository,
      );

      if (!shouldProceed) {
        return;
      }

      const transaction = await transactionRepository.createPendingTransaction({
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
    });

    await this.productCache.deleteProduct(input.productId);

    // OUT OF SCOPE: Publish to queue for post-purchase asynchronous side effects e.g. notifications, email, analytics, etc.
  }

  private async validatePurchaseProduct(
    input: PurchaseProductInput,
    productRepository: ProductRepository,
    flashSaleRepository: FlashSaleRepository,
    transactionRepository: TransactionRepository,
  ): Promise<boolean> {
    const product = await productRepository.findById(input.productId);

    if (!product) {
      throw new ProductNotFoundError(input.productId);
    }

    if (product.stock <= 0) {
      throw new OutOfStockError(input.productId);
    }

    const now = new Date();
    const activeFlashSale =
      await flashSaleRepository.findActiveFlashSaleByProductId(
        input.productId,
        now,
      );

    if (!activeFlashSale) {
      throw new ActiveFlashSaleNotFoundError(input.productId);
    }

    return this.validateTransaction(input, transactionRepository);
  }

  private async validateTransaction(
    input: PurchaseProductInput,
    transactionRepository: TransactionRepository,
  ): Promise<boolean> {
    const existingTransaction =
      await transactionRepository.getTransactionByUserIdAndProductId(
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

export const purchaseService: PurchaseService = new PurchaseService(database);
