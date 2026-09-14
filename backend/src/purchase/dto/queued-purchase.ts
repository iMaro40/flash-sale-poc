import type { PurchaseProductInput } from "./purchase-product";

export interface QueuedPurchase {
  transactionId: string;
  input: PurchaseProductInput;
}
