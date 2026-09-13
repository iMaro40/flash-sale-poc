import { describe, expect, it, vi } from "vitest";

import { ProductCache } from "./cache";
import type { Product } from "./model";

const product: Product = {
  id: "product-1",
  name: "Limited Product",
  stock: 10,
};

describe("ProductCache", () => {
  it("returns undefined instead of throwing when Redis get fails", async () => {
    const redis = {
      get: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
      set: vi.fn(),
    };
    const cache = new ProductCache(redis as never);

    await expect(cache.getProductById(product.id)).resolves.toBeUndefined();
  });

  it("resolves without throwing when Redis set fails", async () => {
    const redis = {
      get: vi.fn(),
      set: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
      del: vi.fn(),
    };
    const cache = new ProductCache(redis as never);

    await expect(cache.setProduct(product)).resolves.toBeUndefined();
  });

  it("deletes a product from Redis", async () => {
    const redis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn().mockResolvedValue(1),
    };
    const cache = new ProductCache(redis as never);

    await cache.deleteProduct(product.id);

    expect(redis.del).toHaveBeenCalledWith(`product:${product.id}`);
  });

  it("resolves without throwing when Redis del fails", async () => {
    const redis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
    };
    const cache = new ProductCache(redis as never);

    await expect(cache.deleteProduct(product.id)).resolves.toBeUndefined();
  });
});
