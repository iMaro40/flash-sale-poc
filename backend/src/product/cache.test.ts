import { describe, expect, it, vi } from "vitest";

import { ProductCache } from "./cache";
import { StockReservationStatus } from "./dto/reserve-stock";
import type { Product } from "./model";

const product: Product = {
  id: "product-1",
  name: "Limited Product",
  stock: 10,
};

describe("ProductCache", () => {
  it("throws when Redis get fails", async () => {
    const redis = {
      hGetAll: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
      set: vi.fn(),
    };
    const cache = new ProductCache(redis as never);

    await expect(cache.getProductById(product.id)).rejects.toThrow(
      "Redis unavailable",
    );
  });

  it("throws when Redis hash write fails", async () => {
    const redis = {
      hGetAll: vi.fn(),
      hSet: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
      expire: vi.fn(),
      set: vi.fn(),
    };
    const cache = new ProductCache(redis as never);

    await expect(cache.setProduct(product)).rejects.toThrow(
      "Redis unavailable",
    );
  });

  it("decrements stock via Redis eval Lua script with reservation key", async () => {
    const redis = {
      eval: vi.fn().mockResolvedValue([0, 9]),
    };
    const cache = new ProductCache(redis as never);

    const remainingStock = await cache.reserveStockByProductId({
      productId: product.id,
      userId: "user-1",
      idempotencyKey: "idem-1",
    });

    expect(remainingStock).toEqual({
      status: StockReservationStatus.RESERVED,
      remainingStock: 9,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('DECR'"),
      {
        keys: [
          `product:${product.id}:stock`,
          `flash-sale:${product.id}`,
          `product:${product.id}:buyer:user-1`,
          `product:${product.id}:reservation:user-1:idem-1`,
        ],
        arguments: [expect.any(String), "idem-1"],
      },
    );
    const script = redis.eval.mock.calls[0][0] as string;
    expect(script).toContain("redis.call('SET', reservationKey, '1')");
    expect(script).not.toMatch(/['"](?:PX|EX|PXAT|EXAT)['"]/);
  });

  it("reports when the product stock key is missing", async () => {
    const redis = {
      eval: vi.fn().mockResolvedValue([5]),
    };
    const cache = new ProductCache(redis as never);

    const remainingStock = await cache.reserveStockByProductId({
      productId: product.id,
      userId: "user-1",
      idempotencyKey: "idem-1",
    });

    expect(remainingStock).toEqual({
      status: StockReservationStatus.PRODUCT_CACHE_MISSING,
      remainingStock: undefined,
    });
  });

  it("throws when Redis eval fails", async () => {
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
    };
    const cache = new ProductCache(redis as never);

    await expect(
      cache.reserveStockByProductId({
        productId: product.id,
        userId: "user-1",
        idempotencyKey: "idem-1",
      }),
    ).rejects.toThrow("Redis unavailable");
  });

  it("marks a stock reservation as completed", async () => {
    const redis = {
      eval: vi.fn().mockResolvedValue(1),
    };
    const cache = new ProductCache(redis as never);

    await cache.markStockReservationAsCompleted({
      productId: product.id,
      userId: "user-1",
      idempotencyKey: "idem-1",
    });

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("'completed:'"),
      {
        keys: [
          `product:${product.id}:buyer:user-1`,
          `product:${product.id}:reservation:user-1:idem-1`,
          `flash-sale:${product.id}`,
        ],
        arguments: ["idem-1"],
      },
    );
  });

  it("releases stock in Redis via eval Lua script", async () => {
    const redis = {
      eval: vi.fn().mockResolvedValue(10),
    };
    const cache = new ProductCache(redis as never);

    await cache.releaseStockByProductId({
      productId: product.id,
      userId: "user-1",
      idempotencyKey: "idem-1",
    });

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR'"),
      {
        keys: [
          `product:${product.id}:stock`,
          `product:${product.id}:buyer:user-1`,
          `product:${product.id}:reservation:user-1:idem-1`,
        ],
        arguments: ["idem-1"],
      },
    );
  });

  it("throws when Redis eval fails on releaseStock", async () => {
    const redis = {
      eval: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
    };
    const cache = new ProductCache(redis as never);

    await expect(
      cache.releaseStockByProductId({
        productId: product.id,
        userId: "user-1",
        idempotencyKey: "idem-1",
      }),
    ).rejects.toThrow("Redis unavailable");
  });
});
