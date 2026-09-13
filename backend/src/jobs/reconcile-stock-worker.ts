import { connectRedis } from "../redis";
import { runReconcileStock } from "./reconcile-stock";

const INTERVAL_MS = Number(
  process.env.RECONCILE_STOCK_INTERVAL_MS ?? 10 * 60 * 1000,
);

// Long-running worker for the dedicated docker-compose service: runs the
// reconciliation job on a fixed interval instead of relying on OS cron.
const startWorker = async (): Promise<void> => {
  await connectRedis();

  console.log(
    `[reconcile-stock-worker] Started, running every ${INTERVAL_MS}ms`,
  );

  const tick = async (): Promise<void> => {
    try {
      await runReconcileStock();
    } catch (error) {
      console.error(
        "[reconcile-stock-worker] Failed to reconcile stock",
        error,
      );
    }
  };

  await tick();
  setInterval((): void => {
    void tick();
  }, INTERVAL_MS);
};

void startWorker();
