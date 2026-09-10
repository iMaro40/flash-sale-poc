export enum TransactionStatus {
  Pending = "pending",
  Completed = "completed",
  Failed = "failed",
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
