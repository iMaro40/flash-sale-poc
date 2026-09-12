import { describe, expect, it, vi } from "vitest";

import { FlashSaleCache } from "./cache";
import { FlashSaleStatus, type FlashSale } from "./model";

const flashSale: FlashSale = {
  id: "flash-sale-1",
  productId: "product-1",
  startTime: new Date("2026-09-12T10:00:00.000Z"),
  endTime: new Date("2026-09-12T11:00:00.000Z"),
  status: FlashSaleStatus.Active,
};

describe("FlashSaleCache", () => {
  it("returns the cached flash sale with the proper data types", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(JSON.stringify(flashSale)),
      set: vi.fn(),
    };
    const cache = new FlashSaleCache(redis as never);

    const result = await cache.getActiveFlashSaleByProductId(
      flashSale.productId,
    );

    expect(result).toEqual(flashSale);
    expect(result?.startTime).toBeInstanceOf(Date);
    expect(result?.endTime).toBeInstanceOf(Date);
    expect(redis.get).toHaveBeenCalledWith("flash-sale:product-1");
  });

  it("returns undefined on a cache miss", async () => {
    const redis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    };
    const cache = new FlashSaleCache(redis as never);

    await expect(
      cache.getActiveFlashSaleByProductId(flashSale.productId),
    ).resolves.toBeUndefined();
  });

  it("returns undefined instead of throwing when Redis get fails", async () => {
    const redis = {
      get: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
      set: vi.fn(),
    };
    const cache = new FlashSaleCache(redis as never);

    await expect(
      cache.getActiveFlashSaleByProductId(flashSale.productId),
    ).resolves.toBeUndefined();
  });

  it("stores an active flash sale with a five-minute TTL", async () => {
    const redis = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue("OK"),
    };
    const cache = new FlashSaleCache(redis as never);

    await cache.setActiveFlashSale(flashSale);

    expect(redis.set).toHaveBeenCalledWith(
      "flash-sale:product-1",
      JSON.stringify(flashSale),
      { EX: 300 },
    );
  });

  it("resolves without throwing when Redis set fails", async () => {
    const redis = {
      get: vi.fn(),
      set: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
    };
    const cache = new FlashSaleCache(redis as never);

    await expect(cache.setActiveFlashSale(flashSale)).resolves.toBeUndefined();
  });
});
