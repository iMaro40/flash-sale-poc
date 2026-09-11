import type { Knex } from "knex";

import { database } from "../database";
import { TransactionAlreadyExistsError } from "../errors/transaction-already-exists";
import { ActiveFlashSaleNotFoundError } from "../errors/active-flash-sale-not-found";
import { ProductNotFoundError } from "../errors/product-not-found";
import { FlashSaleRepository } from "../flash-sale/repository";
import { ProductRepository } from "../product/repository";
import { TransactionRepository } from "../transactions/repository";
import type { PurchaseProductInput } from "./dto/purchase-product";

export class PurchaseService {
  public constructor(private readonly db: Knex) {}

  public async purchaseProduct(input: PurchaseProductInput): Promise<void> {
    await this.db.transaction(async (trx: Knex.Transaction): Promise<void> => {
      const productRepository: ProductRepository = new ProductRepository(trx);
      const flashSaleRepository: FlashSaleRepository = new FlashSaleRepository(
        trx,
      );
      const transactionRepository: TransactionRepository =
        new TransactionRepository(trx);

      await this.validatePurchaseProduct(
        input,
        productRepository,
        flashSaleRepository,
        transactionRepository,
      );

      await transactionRepository.createPendingTransaction({
        idempotencyKey: input.idempotencyKey,
        productId: input.productId,
        userId: input.userId,
      });
    });
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

    const activeFlashSale =
      await flashSaleRepository.findActiveFlashSaleByProductId(
        input.productId,
        new Date(),
      );

    if (!activeFlashSale) {
      throw new ActiveFlashSaleNotFoundError(input.productId);
    }

    const existingTransaction =
      await transactionRepository.getTransactionByIdempotencyKeyAndUserId(
        input.idempotencyKey,
        input.userId,
      );

    if (existingTransaction) {
      throw new TransactionAlreadyExistsError(
        input.idempotencyKey,
        input.userId,
      );
    }

    // TODO: Decrement stock.
  }
}

export const purchaseService: PurchaseService = new PurchaseService(database);
