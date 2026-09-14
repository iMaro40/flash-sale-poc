import type { Knex } from "knex";
import { describe, expect, it, vi } from "vitest";

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

const createService = (): {
  service: PurchaseService;
  transaction: ReturnType<typeof vi.fn>;
  reserveStockByProductId: ReturnType<typeof vi.fn>;
  completeStockReservation: ReturnType<typeof vi.fn>;
  deleteProductDetailsCache: ReturnType<typeof vi.fn>;
  findActiveFlashSaleByProductId: ReturnType<typeof vi.fn>;
} => {
  const transaction = vi.fn();
  const reserveStockByProductId = vi.fn();
  const completeStockReservation = vi.fn();
  const deleteProductDetailsCache = vi.fn();
  const findActiveFlashSaleByProductId = vi.fn();

  const service = new PurchaseService(
    { transaction } as unknown as Knex,
    {
      reserveStockByProductId,
      releaseStockByProductId: vi.fn(),
      completeStockReservation,
      deleteProductDetailsCache,
    } as unknown as ProductService,
    {
      findActiveFlashSaleByProductId,
    } as unknown as FlashSaleService,
  );

  return {
    service,
    transaction,
    reserveStockByProductId,
    completeStockReservation,
    deleteProductDetailsCache,
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

  it("completes a cached reservation and clears product details after purchase", async () => {
    const {
      service,
      transaction,
      reserveStockByProductId,
      completeStockReservation,
      deleteProductDetailsCache,
    } = createService();
    transaction.mockResolvedValue(undefined);
    reserveStockByProductId.mockResolvedValue({
      status: StockReservationStatus.RESERVED,
      remainingStock: 9,
    });

    await expect(service.purchaseProduct(input)).resolves.toBeUndefined();

    expect(transaction).toHaveBeenCalledOnce();
    expect(completeStockReservation).toHaveBeenCalledWith(input);
    expect(deleteProductDetailsCache).toHaveBeenCalledWith(input.productId);
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
