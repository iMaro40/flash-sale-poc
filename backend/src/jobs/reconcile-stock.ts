import { closeDatabase } from "../database";
import { closeRedis, connectRedis } from "../redis";
import { productService } from "../product/service";

export const runReconcileStock = async (): Promise<void> => {
  const reconciledCount = await productService.reconcileStock();
  console.log(
    `[reconcile-stock] Resynced Redis stock for ${reconciledCount} product(s)`,
  );
};

// Standalone entrypoint for a one-off run (e.g. triggered by an external scheduler)
if (require.main === module) {
  void (async (): Promise<void> => {
    try {
      await connectRedis();
      await runReconcileStock();
    } catch (error) {
      console.error("[reconcile-stock] Failed to reconcile stock", error);
      process.exitCode = 1;
    } finally {
      await Promise.all([closeRedis(), closeDatabase()]);
    }
  })();
}
