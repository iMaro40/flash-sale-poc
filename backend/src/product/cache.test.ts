import { describe, expect, it, vi } from "vitest";

import { ProductCache } from "./cache";
import type { Product } from "./model";

const product: Product = {
  id: "product-1",
  name: "Limited Product",
  stock: 10,
};

describe("ProductCache", () => {
  it("throws when Redis get fails", async () => {
    const redis = {
      get: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
      set: vi.fn(),
    };
    const cache = new ProductCache(redis as never);

    await expect(cache.getProductById(product.id)).rejects.toThrow(
      "Redis unavailable",
    );
  });

  it("throws when Redis set fails", async () => {
    const redis = {
      get: vi.fn(),
      set: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
      del: vi.fn(),
    };
    const cache = new ProductCache(redis as never);

    await expect(cache.setProduct(product)).rejects.toThrow(
      "Redis unavailable",
    );
  });

  it("deletes a product from Redis", async () => {
    const redis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn().mockResolvedValue(2),
    };
    const cache = new ProductCache(redis as never);

    await cache.deleteProduct(product.id);

    expect(redis.del).toHaveBeenCalledWith([
      `product:${product.id}`,
      `product:stock:${product.id}`,
    ]);
  });

  it("throws when Redis del fails", async () => {
    const redis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
    };
    const cache = new ProductCache(redis as never);

    await expect(cache.deleteProduct(product.id)).rejects.toThrow(
      "Redis unavailable",
    );
  });

  it("decrements stock via Redis eval Lua script with reservation key", async () => {
    const redis = {
      eval: vi.fn().mockResolvedValue(9),
    };
    const cache = new ProductCache(redis as never);

    const remainingStock = await cache.reserveStockByProductId({
      productId: product.id,
      userId: "user-1",
      idempotencyKey: "idem-1",
    });

    expect(remainingStock).toBe(9);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('DECR'"),
      {
        keys: [
          `product:stock:${product.id}`,
          `reservation:${product.id}:user-1:idem-1`,
        ],
        arguments: [],
      },
    );
  });

  it("returns undefined when key is missing in cache (eval returns -1)", async () => {
    const redis = {
      eval: vi.fn().mockResolvedValue(-1),
    };
    const cache = new ProductCache(redis as never);

    const remainingStock = await cache.reserveStockByProductId({
      productId: product.id,
      userId: "user-1",
      idempotencyKey: "idem-1",
    });

    expect(remainingStock).toBeUndefined();
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
          `product:stock:${product.id}`,
          `reservation:${product.id}:user-1:idem-1`,
        ],
        arguments: [],
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
