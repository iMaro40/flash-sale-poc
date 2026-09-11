import type { Knex } from "knex";

import type { CreatePendingTransactionInput } from "./dto/create-pending-transaction";
import { TransactionStatus, type Transaction } from "./model";

interface TransactionDbRow {
  id: string;
  idempotency_key: string;
  product_id: string;
  user_id: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export class TransactionRepository {
  public constructor(private readonly db: Knex) {}

  private mapToTransaction(row: TransactionDbRow): Transaction {
    return {
      id: row.id,
      idempotencyKey: row.idempotency_key,
      productId: row.product_id,
      userId: row.user_id,
      status: row.status as TransactionStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public async getTransactionByIdempotencyKeyAndUserId(
    idempotencyKey: string,
    userId: string,
  ): Promise<Transaction | undefined> {
    const transaction = await this.db<TransactionDbRow>("transactions")
      .where("idempotency_key", idempotencyKey)
      .andWhere("user_id", userId)
      .first();

    return transaction ? this.mapToTransaction(transaction) : undefined;
  }

  public async getTransactionByUserIdAndProductId(
    userId: string,
    productId: string,
  ): Promise<Transaction | undefined> {
    const transaction = await this.db<TransactionDbRow>("transactions")
      .where("user_id", userId)
      .andWhere("product_id", productId)
      .first();

    return transaction ? this.mapToTransaction(transaction) : undefined;
  }

  public async createPendingTransaction(
    input: CreatePendingTransactionInput,
  ): Promise<Transaction> {
    const [transaction] = await this.db<TransactionDbRow>("transactions")
      .insert({
        idempotency_key: input.idempotencyKey,
        product_id: input.productId,
        user_id: input.userId,
      })
      .returning("*");

    return this.mapToTransaction(transaction);
  }

  public async updateTransactionStatusById(
    id: string,
    status: TransactionStatus,
  ): Promise<void> {
    await this.db<TransactionDbRow>("transactions").where("id", id).update({
      status,
      updated_at: new Date(),
    });
  }
}
