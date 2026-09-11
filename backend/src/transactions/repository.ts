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

  public async getTransactionByIdempotencyKeyAndUserId(
    idempotencyKey: string,
    userId: string,
  ): Promise<Transaction | undefined> {
    const transaction = await this.db<TransactionDbRow>("transactions")
      .where("idempotency_key", idempotencyKey)
      .andWhere("user_id", userId)
      .first();

    if (!transaction) {
      return undefined;
    }

    return {
      id: transaction.id,
      idempotencyKey: transaction.idempotency_key,
      productId: transaction.product_id,
      userId: transaction.user_id,
      status: transaction.status as TransactionStatus,
      createdAt: transaction.created_at,
      updatedAt: transaction.updated_at,
    };
  }

  public async createPendingTransaction(
    input: CreatePendingTransactionInput,
  ): Promise<void> {
    await this.db<TransactionDbRow>("transactions").insert({
      idempotency_key: input.idempotencyKey,
      product_id: input.productId,
      user_id: input.userId,
    });
  }
}
