export enum TransactionStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
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
