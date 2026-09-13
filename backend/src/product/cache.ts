import type { RedisClientType } from "redis";

import type { ReleaseStockInput, ReserveStockInput } from "./dto/reserve-stock";
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
    input: ReserveStockInput,
  ): Promise<number | undefined> {
    const luaScript = `
      local stockKey = KEYS[1]
      local reservationKey = KEYS[2]

      if reservationKey and redis.call('EXISTS', reservationKey) == 1 then
        local stock = redis.call('GET', stockKey)
        return tonumber(stock) or 0
      end

      local stock = redis.call('GET', stockKey)

      if not stock then
        return -1
      end

      local currentStock = tonumber(stock)
      if currentStock <= 0 then
        return -2
      end

      local newStock = redis.call('DECR', stockKey)
      if reservationKey then
        -- Reserved stock key expires after 30 seconds
        redis.call('SET', reservationKey, '1', 'EX', 30)
      end

      return newStock
    `;

    const keys = [
      `product:stock:${input.productId}`,
      `reservation:${input.productId}:${input.userId}:${input.idempotencyKey}`,
    ];

    const result = await this.redis.eval(luaScript, {
      keys,
      arguments: [],
    });

    const numericResult = Number(result);
    if (numericResult === -1) {
      return undefined;
    }

    return numericResult;
  }

  public async releaseStockByProductId(
    input: ReleaseStockInput,
  ): Promise<void> {
    const keys = [
      `product:stock:${input.productId}`,
      `reservation:${input.productId}:${input.userId}:${input.idempotencyKey}`,
    ];

    const luaScript = `
      local stockKey = KEYS[1]
      local reservationKey = KEYS[2]

      redis.call('INCR', stockKey)
      if reservationKey then
        redis.call('DEL', reservationKey)
      end
    `;

    await this.redis.eval(luaScript, {
      keys,
      arguments: [],
    });
  }
}
