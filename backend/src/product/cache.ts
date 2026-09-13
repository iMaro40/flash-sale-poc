import type { RedisClientType } from "redis";

import type { Product } from "./model";

// Methods wrapped in try-catch blocks so that Redis errors do not block purchase requests
export class ProductCache {
  public constructor(private readonly redis: RedisClientType) {}

  public async getProductById(productId: string): Promise<Product | undefined> {
    try {
      const cachedProduct = await this.redis.get(`product:${productId}`);

      if (!cachedProduct) {
        return undefined;
      }

      return JSON.parse(cachedProduct) as Product;
    } catch (e) {
      console.error("Failed to get product from cache", e);
      return undefined;
    }
  }

  public async setProduct(product: Product): Promise<void> {
    try {
      await this.redis.set(`product:${product.id}`, JSON.stringify(product), {
        EX: 300,
      });
    } catch (e) {
      console.error("Failed to set product in cache", e);
      return undefined;
    }
  }

  public async deleteProduct(productId: string): Promise<void> {
    try {
      await this.redis.del(`product:${productId}`);
    } catch (e) {
      console.error("Failed to delete product from cache", e);
    }
  }
}
