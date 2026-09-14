import type { PurchaseService } from "../purchase/service";
import type { Transaction } from "../transactions/model";

export const reconcileStalePendingTransactions = async (
  transactions: Transaction[],
  service: Pick<PurchaseService, "cancelPurchase">,
): Promise<void> => {
  for (const transaction of transactions) {
    try {
      await service.cancelPurchase(transaction.id, {
        productId: transaction.productId,
        userId: transaction.userId,
        idempotencyKey: transaction.idempotencyKey,
      });
    } catch (error) {
      console.error(
        "[reconcile-stock-worker] Failed to cancel stale pending transaction",
        { transactionId: transaction.id, error },
      );
    }
  }
};
