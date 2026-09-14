import { describe, expect, it, vi } from "vitest";

import { TransactionStatus, type Transaction } from "../transactions/model";
import { reconcileStalePendingTransactions } from "./reconcile-stock-worker-handler";

const createTransaction = (id: string): Transaction => ({
  id,
  idempotencyKey: `request-${id}`,
  productId: `product-${id}`,
  userId: `user-${id}`,
  status: TransactionStatus.PENDING,
  createdAt: new Date("2026-09-15T10:00:00.000Z"),
  updatedAt: new Date("2026-09-15T10:00:00.000Z"),
});

describe("reconcileStalePendingTransactions", () => {
  it("cancels each stale pending transaction", async () => {
    const transactions = [createTransaction("1"), createTransaction("2")];
    const cancelPurchase = vi.fn().mockResolvedValue(undefined);

    await reconcileStalePendingTransactions(transactions, { cancelPurchase });

    expect(cancelPurchase).toHaveBeenCalledTimes(2);
    expect(cancelPurchase).toHaveBeenNthCalledWith(1, "1", {
      productId: "product-1",
      userId: "user-1",
      idempotencyKey: "request-1",
    });
    expect(cancelPurchase).toHaveBeenNthCalledWith(2, "2", {
      productId: "product-2",
      userId: "user-2",
      idempotencyKey: "request-2",
    });
  });

  it("continues reconciling when one cancellation fails", async () => {
    const transactions = [createTransaction("1"), createTransaction("2")];
    const error = new Error("database unavailable");
    const cancelPurchase = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await reconcileStalePendingTransactions(transactions, { cancelPurchase });

    expect(cancelPurchase).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      "[reconcile-stock-worker] Failed to cancel stale pending transaction",
      { transactionId: "1", error },
    );
    log.mockRestore();
  });
});
