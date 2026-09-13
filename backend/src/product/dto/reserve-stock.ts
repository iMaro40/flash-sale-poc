export interface ReserveStockInput {
  productId: string;
  userId: string;
  idempotencyKey: string;
}

export interface ReleaseStockInput {
  productId: string;
  userId: string;
  idempotencyKey: string;
}
