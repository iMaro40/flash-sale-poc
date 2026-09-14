import type { RedisClientType } from "redis";

import {
  type ReleaseStockInput,
  type ReserveStockInput,
  type StockReservationResult,
  StockReservationStatus,
} from "./dto/reserve-stock";
import type { Product } from "./model";

export class ProductCache {
  public constructor(private readonly redis: RedisClientType) {}

  public async getProductById(
    productId: string,
  ): Promise<Omit<Product, "stock"> | undefined> {
    // Stock uses separate Redis key
    const cachedProduct = await this.redis.get(`product:${productId}`);

    if (!cachedProduct) {
      return undefined;
    }

    return JSON.parse(cachedProduct) as Omit<Product, "stock">;
  }

  public async setProduct(product: Product): Promise<void> {
    await this.redis.set(`product:${product.id}`, JSON.stringify(product), {
      EX: 300,
    });
    await this.redis.set(
      `product:{${product.id}}:stock`,
      product.stock.toString(),
      { NX: true },
    );
  }

  public async deleteProductDetails(productId: string): Promise<void> {
    await this.redis.del(`product:${productId}`);
  }

  public async setStockByProductId(
    productId: string,
    stock: number,
  ): Promise<void> {
    await this.redis.set(`product:{${productId}}:stock`, stock.toString());
  }

  // One Redis script decides the purchase: sale window, one-per-user, stock, then DECR.
  public async reserveStockByProductId(
    input: ReserveStockInput,
  ): Promise<StockReservationResult> {
    const luaScript = `
      local stockKey = KEYS[1]
      local saleWindowKey = KEYS[2]
      local buyerKey = KEYS[3]
      local reservationKey = KEYS[4]
      local now = tonumber(ARGV[1])
      local idempotencyKey = ARGV[2]

      local stock = redis.call('GET', stockKey)
      if not stock then
        return {5}
      end

      local saleStart = redis.call('HGET', saleWindowKey, 'startTime')
      local saleEnd = redis.call('HGET', saleWindowKey, 'endTime')
      if not saleStart or not saleEnd then
        return {6}
      end

      if now < tonumber(saleStart) or now >= tonumber(saleEnd) then
        return {7}
      end

      local buyer = redis.call('GET', buyerKey)
      if buyer then
        if buyer == 'completed:' .. idempotencyKey then
          return {1}
        end

        if buyer == 'pending:' .. idempotencyKey then
          return {2}
        end

        if string.sub(buyer, 1, 8) == 'pending:' then
          return {8}
        end

        return {3}
      end

      local currentStock = tonumber(stock)
      if currentStock <= 0 then
        return {4}
      end

      local newStock = redis.call('DECR', stockKey)

      redis.call(
        'SET',
        buyerKey,
        'pending:' .. idempotencyKey,
        'PX',
        120000
      )
      redis.call('SET', reservationKey, '1', 'EX', 120)

      return {0, newStock}
    `;

    // The shared {productId} hash tag keeps every key in one Redis Cluster slot,
    // which allows the atomic Lua script to work after scaling beyond one node.
    const keys = [
      `product:{${input.productId}}:stock`,
      `flash-sale:{${input.productId}}:window`,
      `product:{${input.productId}}:buyer:${input.userId}`,
      `product:{${input.productId}}:reservation:${input.userId}:${input.idempotencyKey}`,
    ];

    const result = await this.redis.eval(luaScript, {
      keys,
      arguments: [Date.now().toString(), input.idempotencyKey],
    });

    const [resultCode, remainingStock] = result as [number, number?];
    const statusByResultCode: Record<number, StockReservationStatus> = {
      0: StockReservationStatus.RESERVED,
      1: StockReservationStatus.IDEMPOTENT_SUCCESS,
      2: StockReservationStatus.DUPLICATE_TRANSACTION,
      3: StockReservationStatus.ALREADY_PURCHASED,
      4: StockReservationStatus.OUT_OF_STOCK,
      5: StockReservationStatus.PRODUCT_CACHE_MISSING,
      6: StockReservationStatus.FLASH_SALE_CACHE_MISSING,
      7: StockReservationStatus.SALE_INACTIVE,
      8: StockReservationStatus.TRANSACTION_IN_PROGRESS,
    };
    const status = statusByResultCode[Number(resultCode)];

    if (!status) {
      throw new Error(`Unknown stock reservation result: ${resultCode}`);
    }

    return {
      status,
      remainingStock:
        remainingStock === undefined ? undefined : Number(remainingStock),
    };
  }

  public async completeStockReservation(
    input: ReserveStockInput,
  ): Promise<void> {
    const luaScript = `
      local buyerKey = KEYS[1]
      local reservationKey = KEYS[2]
      local saleWindowKey = KEYS[3]
      local pendingValue = 'pending:' .. ARGV[1]

      if redis.call('GET', buyerKey) == pendingValue then
        local saleEnd = redis.call('HGET', saleWindowKey, 'endTime')

        if saleEnd then
          redis.call(
            'SET',
            buyerKey,
            'completed:' .. ARGV[1],
            'PXAT',
            tonumber(saleEnd) + 86400000
          )
        else
          redis.call('SET', buyerKey, 'completed:' .. ARGV[1], 'EX', 86400)
        end

        redis.call('DEL', reservationKey)
      end
    `;

    await this.redis.eval(luaScript, {
      keys: [
        `product:{${input.productId}}:buyer:${input.userId}`,
        `product:{${input.productId}}:reservation:${input.userId}:${input.idempotencyKey}`,
        `flash-sale:{${input.productId}}:window`,
      ],
      arguments: [input.idempotencyKey],
    });
  }

  public async releaseStockByProductId(
    input: ReleaseStockInput,
  ): Promise<void> {
    const keys = [
      `product:{${input.productId}}:stock`,
      `product:{${input.productId}}:buyer:${input.userId}`,
      `product:{${input.productId}}:reservation:${input.userId}:${input.idempotencyKey}`,
    ];

    const luaScript = `
      local stockKey = KEYS[1]
      local buyerKey = KEYS[2]
      local reservationKey = KEYS[3]
      local pendingValue = 'pending:' .. ARGV[1]

      if redis.call('EXISTS', reservationKey) == 1
        and redis.call('GET', buyerKey) == pendingValue then
        redis.call('INCR', stockKey)
        redis.call('DEL', reservationKey)
        redis.call('DEL', buyerKey)
      end
    `;

    await this.redis.eval(luaScript, {
      keys,
      arguments: [input.idempotencyKey],
    });
  }
}
