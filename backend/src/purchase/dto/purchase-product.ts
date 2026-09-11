export interface PurchaseProductInput {
  productId: string;
  userId: string;
  idempotencyKey: string;
}
