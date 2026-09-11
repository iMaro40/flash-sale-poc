export interface CreatePendingTransactionInput {
  idempotencyKey: string;
  productId: string;
  userId: string;
}
