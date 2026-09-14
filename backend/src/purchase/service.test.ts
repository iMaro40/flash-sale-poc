import type { Channel } from "amqplib";
import type { Knex } from "knex";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveFlashSaleNotFoundError } from "../errors/active-flash-sale-not-found";
import { OutOfStockError } from "../errors/out-of-stock";
import type { FlashSaleService } from "../flash-sale/service";
import { StockReservationStatus } from "../product/dto/reserve-stock";
import type { ProductService } from "../product/service";
import type { TransactionRepository } from "../transactions/repository";
import { PurchaseAcceptanceStatus } from "./dto/purchase-acceptance";
import type { PurchaseProductInput } from "./dto/purchase-product";
import { PurchaseService } from "./service";

const input: PurchaseProductInput = {
  productId: "product-1",
  userId: "user-1",
  idempotencyKey: "idempotency-1",
};

afterEach(() => vi.restoreAllMocks());

const createService = (): {
  service: PurchaseService;
  transaction: ReturnType<typeof vi.fn>;
  releaseStockByProductId: ReturnType<typeof vi.fn>;
  reserveStockByProductId: ReturnType<typeof vi.fn>;
  markStockReservationAsCompleted: ReturnType<typeof vi.fn>;
  findActiveFlashSaleByProductId: ReturnType<typeof vi.fn>;
  sendToQueue: ReturnType<typeof vi.fn>;
  createPendingTransaction: ReturnType<typeof vi.fn>;
} => {
  const transaction = vi.fn();
  const releaseStockByProductId = vi.fn();
  const reserveStockByProductId = vi.fn();
  const markStockReservationAsCompleted = vi.fn();
  const findActiveFlashSaleByProductId = vi.fn();
  const sendToQueue = vi.fn();
  const createPendingTransaction = vi.fn().mockResolvedValue({
    id: "transaction-1",
  });
  const assertQueue = vi.fn().mockResolvedValue(undefined);
  const assertExchange = vi.fn().mockResolvedValue(undefined);
  const bindQueue = vi.fn().mockResolvedValue(undefined);
  const channel = {
    sendToQueue,
    assertQueue,
    assertExchange,
    bindQueue,
  } as unknown as Channel;

  const service = new PurchaseService(
    { transaction } as unknown as Knex,
    {
      reserveStockByProductId,
      releaseStockByProductId,
      markStockReservationAsCompleted,
    } as unknown as ProductService,
    {
      findActiveFlashSaleByProductId,
    } as unknown as FlashSaleService,
    () => channel,
    { createPendingTransaction } as unknown as TransactionRepository,
  );

  return {
    service,
    transaction,
    releaseStockByProductId,
    reserveStockByProductId,
    markStockReservationAsCompleted,
    findActiveFlashSaleByProductId,
    sendToQueue,
    createPendingTransaction,
  };
};

describe("PurchaseService.purchaseProduct", () => {
  it("rejects sold-out attempts without publishing to the queue", async () => {
    const { service, sendToQueue, reserveStockByProductId } = createService();
    reserveStockByProductId.mockResolvedValue({
      status: StockReservationStatus.OUT_OF_STOCK,
    });

    await expect(service.purchaseProduct(input)).rejects.toBeInstanceOf(
      OutOfStockError,
    );
    expect(sendToQueue).not.toHaveBeenCalled();
  });

  it("publishes a reserved purchase to the queue for async processing", async () => {
    const {
      service,
      sendToQueue,
      reserveStockByProductId,
      createPendingTransaction,
    } = createService();
    reserveStockByProductId.mockResolvedValue({
      status: StockReservationStatus.RESERVED,
      remainingStock: 9,
    });

    await expect(service.purchaseProduct(input)).resolves.toBe(
      PurchaseAcceptanceStatus.ACCEPTED,
    );
    expect(sendToQueue).toHaveBeenCalledWith(
      expect.any(String),
      Buffer.from(JSON.stringify({ transactionId: "transaction-1", input })),
      { persistent: true },
    );
    expect(createPendingTransaction).toHaveBeenCalledWith(input);
  });

  it("returns idempotent success without publishing to the queue", async () => {
    const { service, sendToQueue, reserveStockByProductId } = createService();
    reserveStockByProductId.mockResolvedValue({
      status: StockReservationStatus.IDEMPOTENT_SUCCESS,
    });

    await expect(service.purchaseProduct(input)).resolves.toBe(
      PurchaseAcceptanceStatus.ALREADY_COMPLETED,
    );
    expect(sendToQueue).not.toHaveBeenCalled();
  });

  it("loads an active sale only when its Redis window is missing", async () => {
    const {
      service,
      sendToQueue,
      reserveStockByProductId,
      findActiveFlashSaleByProductId,
    } = createService();
    reserveStockByProductId
      .mockResolvedValueOnce({
        status: StockReservationStatus.FLASH_SALE_CACHE_MISSING,
      })
      .mockResolvedValueOnce({
        status: StockReservationStatus.OUT_OF_STOCK,
      });
    findActiveFlashSaleByProductId.mockResolvedValue({
      id: "sale-1",
      productId: input.productId,
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date(Date.now() + 60_000),
    });

    await expect(service.purchaseProduct(input)).rejects.toBeInstanceOf(
      OutOfStockError,
    );
    expect(findActiveFlashSaleByProductId).toHaveBeenCalledWith(
      input.productId,
    );
    expect(reserveStockByProductId).toHaveBeenCalledTimes(2);
    expect(sendToQueue).not.toHaveBeenCalled();
  });

  it("rejects when a missing Redis window cannot be loaded", async () => {
    const {
      service,
      sendToQueue,
      reserveStockByProductId,
      findActiveFlashSaleByProductId,
    } = createService();
    reserveStockByProductId.mockResolvedValue({
      status: StockReservationStatus.FLASH_SALE_CACHE_MISSING,
    });
    findActiveFlashSaleByProductId.mockResolvedValue(undefined);

    await expect(service.purchaseProduct(input)).rejects.toBeInstanceOf(
      ActiveFlashSaleNotFoundError,
    );
    expect(sendToQueue).not.toHaveBeenCalled();
  });
});

describe("PurchaseService.completePurchase", () => {
  it("completes a reserved purchase", async () => {
    const { service, transaction, markStockReservationAsCompleted } =
      createService();
    transaction.mockResolvedValue(undefined);

    await expect(
      service.completePurchase(input, "transaction-1"),
    ).resolves.toBeUndefined();

    expect(transaction).toHaveBeenCalledOnce();
    expect(markStockReservationAsCompleted).toHaveBeenCalledWith(input);
  });

  const rollbackErrors = [
    new OutOfStockError(input.productId),
    ...["23505", "23514"].map((code) =>
      Object.assign(new Error(code), { code }),
    ),
  ];

  it.each(rollbackErrors)(
    "releases stock on confirmed rollback: %s",
    async (error) => {
      const { service, transaction, releaseStockByProductId } = createService();
      transaction.mockRejectedValue(error);

      await expect(
        service.completePurchase(input, "transaction-1"),
      ).rejects.toBe(error);
      expect(releaseStockByProductId).toHaveBeenCalledWith(input);
    },
  );

  it.each(["40P01", "40001"])(
    "retains stock for retryable rollback errors: %s",
    async (code) => {
      const {
        service,
        transaction,
        releaseStockByProductId,
        markStockReservationAsCompleted,
      } = createService();
      const error = Object.assign(new Error(code), { code });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      transaction.mockRejectedValue(error);

      await expect(
        service.completePurchase(input, "transaction-1"),
      ).rejects.toBe(error);
      expect(releaseStockByProductId).not.toHaveBeenCalled();
      expect(markStockReservationAsCompleted).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        "Database transaction outcome is unknown. Need to reconcile inventory.",
        expect.objectContaining({ error }),
      );
    },
  );

  it.each(["ECONNRESET", "08006", "57P01", undefined])(
    "retains stock and logs reconciliation for an uncertain outcome: %s",
    async (code) => {
      const {
        service,
        transaction,
        releaseStockByProductId,
        markStockReservationAsCompleted,
      } = createService();
      const error = Object.assign(new Error("Connection lost"), { code });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      transaction.mockRejectedValue(error);

      await expect(
        service.completePurchase(input, "transaction-1"),
      ).rejects.toBe(error);
      expect(releaseStockByProductId).not.toHaveBeenCalled();
      expect(markStockReservationAsCompleted).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        "Database transaction outcome is unknown. Need to reconcile inventory.",
        {
          productId: input.productId,
          idempotencyKey: input.idempotencyKey,
          error,
        },
      );
    },
  );

  it("preserves the original rollback error when releasing stock fails", async () => {
    const { service, transaction, releaseStockByProductId } = createService();
    const error = new OutOfStockError(input.productId);
    const releaseError = new Error("Redis unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    transaction.mockRejectedValue(error);
    releaseStockByProductId.mockRejectedValue(releaseError);

    await expect(service.completePurchase(input, "transaction-1")).rejects.toBe(
      error,
    );
    expect(log).toHaveBeenCalledWith(
      "Failed to release rolled-back reservation",
      releaseError,
    );
  });
});
