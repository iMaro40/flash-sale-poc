export enum TransactionStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export interface Transaction {
  id: string;
  idempotencyKey: string;
  productId: string;
  userId: string;
  status: TransactionStatus;
  createdAt: Date;
  updatedAt: Date;
}
