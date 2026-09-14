import { describe, expect, it, vi } from "vitest";

import { FlashSaleCache } from "./cache";
import { FlashSaleStatus, type FlashSale } from "./model";

const flashSale: FlashSale = {
  id: "flash-sale-1",
  productId: "product-1",
  startTime: new Date("2026-09-12T10:00:00.000Z"),
  endTime: new Date("2026-09-12T11:00:00.000Z"),
  status: FlashSaleStatus.ACTIVE,
};

describe("FlashSaleCache", () => {
  it("returns the cached flash sale with the proper data types", async () => {
    const redis = {
      hGetAll: vi.fn().mockResolvedValue({
        id: flashSale.id,
        productId: flashSale.productId,
        startTime: flashSale.startTime.getTime().toString(),
        endTime: flashSale.endTime.getTime().toString(),
        status: flashSale.status,
      }),
      hSet: vi.fn(),
      expireAt: vi.fn(),
    };
    const cache = new FlashSaleCache(redis as never);

    const result = await cache.getActiveFlashSaleByProductId(
      flashSale.productId,
    );

    expect(result).toEqual(flashSale);
    expect(result?.startTime).toBeInstanceOf(Date);
    expect(result?.endTime).toBeInstanceOf(Date);
    expect(redis.hGetAll).toHaveBeenCalledWith("flash-sale:product-1");
  });

  it("returns undefined on a cache miss", async () => {
    const redis = {
      hGetAll: vi.fn().mockResolvedValue({}),
      hSet: vi.fn(),
      expireAt: vi.fn(),
    };
    const cache = new FlashSaleCache(redis as never);

    await expect(
      cache.getActiveFlashSaleByProductId(flashSale.productId),
    ).resolves.toBeUndefined();
  });

  it("throws when Redis get fails", async () => {
    const redis = {
      hGetAll: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
      hSet: vi.fn(),
      expireAt: vi.fn(),
    };
    const cache = new FlashSaleCache(redis as never);

    await expect(
      cache.getActiveFlashSaleByProductId(flashSale.productId),
    ).rejects.toThrow("Redis unavailable");
  });

  it("stores an active flash sale in one hash until one day after it ends", async () => {
    const redis = {
      hGetAll: vi.fn(),
      hSet: vi.fn().mockResolvedValue(2),
      expireAt: vi.fn().mockResolvedValue(true),
    };
    const cache = new FlashSaleCache(redis as never);

    await cache.setActiveFlashSale(flashSale);

    expect(redis.hSet).toHaveBeenCalledWith("flash-sale:product-1", {
      id: flashSale.id,
      productId: flashSale.productId,
      startTime: flashSale.startTime.getTime().toString(),
      endTime: flashSale.endTime.getTime().toString(),
      status: flashSale.status,
    });
    expect(redis.expireAt).toHaveBeenCalledWith(
      "flash-sale:product-1",
      Math.ceil(flashSale.endTime.getTime() / 1000) + 24 * 60 * 60,
    );
  });

  it("throws when Redis set fails", async () => {
    const redis = {
      hGetAll: vi.fn(),
      hSet: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
      expireAt: vi.fn(),
    };
    const cache = new FlashSaleCache(redis as never);

    await expect(cache.setActiveFlashSale(flashSale)).rejects.toThrow(
      "Redis unavailable",
    );
  });
});
