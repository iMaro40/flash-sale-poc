import type { Knex } from "knex";

import { database } from "../database";
import { ActiveFlashSaleNotFoundError } from "../errors/active-flash-sale-not-found";
import { ProductAlreadyPurchasedError } from "../errors/product-already-purchased";
import { ProductNotFoundError } from "../errors/product-not-found";
import { OutOfStockError } from "../errors/out-of-stock";
import { FlashSaleRepository } from "../flash-sale/repository";
import { ProductRepository } from "../product/repository";
import { TransactionStatus } from "../transactions/model";
import { TransactionRepository } from "../transactions/repository";
import type { PurchaseProductInput } from "./dto/purchase-product";

export class PurchaseService {
  public constructor(private readonly db: Knex) {}

  public async purchaseProduct(input: PurchaseProductInput): Promise<void> {
    await this.db.transaction(async (trx: Knex.Transaction): Promise<void> => {
      const flashSaleRepository: FlashSaleRepository = new FlashSaleRepository(
        trx,
      );
      const productRepository: ProductRepository = new ProductRepository(trx);
      const transactionRepository: TransactionRepository =
        new TransactionRepository(trx);

      await this.validatePurchaseProduct(
        input,
        productRepository,
        flashSaleRepository,
        transactionRepository,
      );

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

    // OUT OF SCOPE: Publish to queue for post-purchase asynchronous side effects e.g. notifications, email, analytics, etc.
  }

  private async validatePurchaseProduct(
    input: PurchaseProductInput,
    productRepository: ProductRepository,
    flashSaleRepository: FlashSaleRepository,
    transactionRepository: TransactionRepository,
  ): Promise<void> {
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

    const existingPurchase =
      await transactionRepository.getTransactionByUserIdAndProductId(
        input.userId,
        input.productId,
      );

    if (existingPurchase) {
      throw new ProductAlreadyPurchasedError(input.userId, input.productId);
    }
  }
}

export const purchaseService: PurchaseService = new PurchaseService(database);
