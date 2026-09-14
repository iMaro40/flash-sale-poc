import type { Knex } from "knex";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveFlashSaleNotFoundError } from "../errors/active-flash-sale-not-found";
import { OutOfStockError } from "../errors/out-of-stock";
import type { FlashSaleService } from "../flash-sale/service";
import { StockReservationStatus } from "../product/dto/reserve-stock";
import type { ProductService } from "../product/service";
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
} => {
  const transaction = vi.fn();
  const releaseStockByProductId = vi.fn();
  const reserveStockByProductId = vi.fn();
  const markStockReservationAsCompleted = vi.fn();
  const findActiveFlashSaleByProductId = vi.fn();

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
  );

  return {
    service,
    transaction,
    releaseStockByProductId,
    reserveStockByProductId,
    markStockReservationAsCompleted,
    findActiveFlashSaleByProductId,
  };
};

describe("PurchaseService.purchaseProduct", () => {
  it("rejects sold-out attempts without calling Postgres", async () => {
    const { service, transaction, reserveStockByProductId } = createService();
    reserveStockByProductId.mockResolvedValue({
      status: StockReservationStatus.OUT_OF_STOCK,
    });

    await expect(service.purchaseProduct(input)).rejects.toBeInstanceOf(
      OutOfStockError,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it("completes a cached reservation after purchase", async () => {
    const {
      service,
      transaction,
      reserveStockByProductId,
      markStockReservationAsCompleted,
    } = createService();
    transaction.mockResolvedValue(undefined);
    reserveStockByProductId.mockResolvedValue({
      status: StockReservationStatus.RESERVED,
      remainingStock: 9,
    });

    await expect(service.purchaseProduct(input)).resolves.toBeUndefined();

    expect(transaction).toHaveBeenCalledOnce();
    expect(markStockReservationAsCompleted).toHaveBeenCalledWith(input);
  });

  it("returns idempotent success without calling Postgres", async () => {
    const { service, transaction, reserveStockByProductId } = createService();
    reserveStockByProductId.mockResolvedValue({
      status: StockReservationStatus.IDEMPOTENT_SUCCESS,
    });

    await expect(service.purchaseProduct(input)).resolves.toBeUndefined();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("loads an active sale only when its Redis window is missing", async () => {
    const {
      service,
      transaction,
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
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects when a missing Redis window cannot be loaded", async () => {
    const {
      service,
      transaction,
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
    expect(transaction).not.toHaveBeenCalled();
  });
});


describe("purchase transaction failure handling", () => {
  const rollbackErrors = [
    new OutOfStockError(input.productId),
    ...["23505", "23514", "40P01", "40001"].map((code) =>
      Object.assign(new Error(code), { code }),
    ),
  ];

  it.each(rollbackErrors)("releases stock on confirmed rollback: %s", async (error) => {
    const { service, transaction, reserveStockByProductId, releaseStockByProductId } = createService();
    reserveStockByProductId.mockResolvedValue({ status: StockReservationStatus.RESERVED });
    transaction.mockRejectedValue(error);

    await expect(service.purchaseProduct(input)).rejects.toBe(error);
    expect(releaseStockByProductId).toHaveBeenCalledWith(input);
  });

  it.each(["ECONNRESET", "08006", "57P01", undefined])(
    "retains stock and logs reconciliation for an uncertain outcome: %s",
    async (code) => {
      const { service, transaction, reserveStockByProductId, releaseStockByProductId, markStockReservationAsCompleted } = createService();
      const error = Object.assign(new Error("Connection lost"), { code });
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      reserveStockByProductId.mockResolvedValue({ status: StockReservationStatus.RESERVED });
      transaction.mockRejectedValue(error);

      await expect(service.purchaseProduct(input)).rejects.toBe(error);
      expect(releaseStockByProductId).not.toHaveBeenCalled();
      expect(markStockReservationAsCompleted).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        "Database transaction outcome is unknown. Need to reconcile inventory.",
        { productId: input.productId, idempotencyKey: input.idempotencyKey, error },
      );
    },
  );

  it("preserves the original rollback error when releasing stock fails", async () => {
    const { service, transaction, reserveStockByProductId, releaseStockByProductId } = createService();
    const error = new OutOfStockError(input.productId);
    const releaseError = new Error("Redis unavailable");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    reserveStockByProductId.mockResolvedValue({ status: StockReservationStatus.RESERVED });
    transaction.mockRejectedValue(error);
    releaseStockByProductId.mockRejectedValue(releaseError);

    await expect(service.purchaseProduct(input)).rejects.toBe(error);
    expect(log).toHaveBeenCalledWith("Failed to release rolled-back reservation", releaseError);
  });
});
