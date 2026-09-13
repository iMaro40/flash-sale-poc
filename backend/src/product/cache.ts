import type { RedisClientType } from "redis";

import type { Product } from "./model";

export class ProductCache {
  public constructor(private readonly redis: RedisClientType) {}

  public async getProductById(productId: string): Promise<Product | undefined> {
    const cachedProduct = await this.redis.get(`product:${productId}`);

    if (!cachedProduct) {
      return undefined;
    }

    return JSON.parse(cachedProduct) as Product;
  }

  public async setProduct(product: Product): Promise<void> {
    await this.redis.set(`product:${product.id}`, JSON.stringify(product), {
      EX: 300,
    });
    await this.redis.set(
      `product:stock:${product.id}`,
      product.stock.toString(),
      {
        EX: 300,
      },
    );
  }

  public async deleteProduct(productId: string): Promise<void> {
    await this.redis.del([
      `product:${productId}`,
      `product:stock:${productId}`,
    ]);
  }

  public async reserveStockByProductId(
    productId: string,
  ): Promise<number | undefined> {
    const luaScript = `
      local stockKey = KEYS[1]
      local stock = redis.call('GET', stockKey)

      if not stock then
        return -1
      end

      local currentStock = tonumber(stock)
      if currentStock <= 0 then
        return -2
      end

      return redis.call('DECR', stockKey)
    `;

    const result = await this.redis.eval(luaScript, {
      keys: [`product:stock:${productId}`],
      arguments: [],
    });

    const numericResult = Number(result);
    if (numericResult === -1) {
      return undefined;
    }

    return numericResult;
  }

  public async incrementStockByProductId(productId: string): Promise<void> {
    await this.redis.incr(`product:stock:${productId}`);
  }
}
