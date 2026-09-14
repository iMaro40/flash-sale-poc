import "../env";

import { closeDatabase } from "../database";
import { purchaseService } from "../purchase/service";
import { closeRedis, connectRedis } from "../redis";
import { transactionService } from "../transactions/service";
import { reconcileStalePendingTransactions } from "./reconcile-stock-worker-handler";

const RECONCILIATION_INTERVAL_MS = 60_000;
const PENDING_TRANSACTION_MAX_AGE_MS = 5 * 60_000;
let isReconciling = false;

const reconcileStock = async (): Promise<void> => {
  if (isReconciling) {
    return;
  }

  isReconciling = true;

  try {
    const cutoff = new Date(Date.now() - PENDING_TRANSACTION_MAX_AGE_MS);
    const transactions =
      await transactionService.getPendingTransactionsCreatedBefore(cutoff);

    await reconcileStalePendingTransactions(transactions, purchaseService);
  } catch (error) {
    console.error("[reconcile-stock-worker] Failed to reconcile stock", error);
  } finally {
    isReconciling = false;
  }
};

const startWorker = async (): Promise<void> => {
  await connectRedis();
  await reconcileStock();
  setInterval((): void => {
    void reconcileStock();
  }, RECONCILIATION_INTERVAL_MS);
};

void startWorker();

process.on("SIGTERM", (): void => {
  void (async (): Promise<void> => {
    await Promise.all([closeRedis(), closeDatabase()]);
    process.exit(0);
  })();
});
