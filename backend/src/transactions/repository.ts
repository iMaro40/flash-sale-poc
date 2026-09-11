import type { Knex } from "knex";

import type { CreatePendingTransactionInput } from "./dto/create-pending-transaction";

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
