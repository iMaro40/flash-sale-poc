import type { RedisClientType } from "redis";

import {
  type ReleaseStockInput,
  type ReserveStockInput,
  type StockReservationResult,
  StockReservationStatus,
} from "./dto/reserve-stock";
import { redisKeys } from "../redis/keys";
import type { Product } from "./model";

export class ProductCache {
  public constructor(private readonly redis: RedisClientType) {}

  public async getProductById(
    productId: string,
  ): Promise<Omit<Product, "stock"> | undefined> {
    // Stock uses separate Redis key
    const cachedProduct = await this.redis.get(
      redisKeys.productDetails(productId),
    );

    if (!cachedProduct) {
      return undefined;
    }

    return JSON.parse(cachedProduct) as Omit<Product, "stock">;
  }

  public async setProduct(product: Product): Promise<void> {
    await this.redis.set(
      redisKeys.productDetails(product.id),
      JSON.stringify(product),
      { EX: 300 },
    );
    await this.redis.set(
      redisKeys.productStock(product.id),
      product.stock.toString(),
      { NX: true },
    );
  }

  public async deleteProductDetails(productId: string): Promise<void> {
    await this.redis.del(redisKeys.productDetails(productId));
  }

  public async setStockByProductId(
    productId: string,
    stock: number,
  ): Promise<void> {
    await this.redis.set(redisKeys.productStock(productId), stock.toString());
  }

  public async getStockByProductId(
    productId: string,
  ): Promise<number | undefined> {
    const cachedStock = await this.redis.get(redisKeys.productStock(productId));

    if (cachedStock === null) {
      return undefined;
    }

    return Number(cachedStock);
  }

  // One Redis script decides the purchase: sale window, one-per-user, stock, then DECR.
  public async reserveStockByProductId(
    input: ReserveStockInput,
  ): Promise<StockReservationResult> {
    const reserveStockScript = `
      -- The caller passes the stock, sale window, buyer, and reservation keys.
      local stockKey = KEYS[1]
      local saleWindowKey = KEYS[2]
      local buyerKey = KEYS[3]
      local reservationKey = KEYS[4]
      local now = tonumber(ARGV[1])
      local idempotencyKey = ARGV[2]

      -- Check if the stock key exists
      local stock = redis.call('GET', stockKey)
      if not stock then
        return {5}
      end

      -- The sale window is a hash containing millisecond timestamps.
      local saleStart = redis.call('HGET', saleWindowKey, 'startTime')
      local saleEnd = redis.call('HGET', saleWindowKey, 'endTime')
      if not saleStart or not saleEnd then
        return {6}
      end

      -- Reject attempts outside the sale's active time range.
      if now < tonumber(saleStart) or now >= tonumber(saleEnd) then
        return {7}
      end

      -- Checks if buyer has a pending or complete transaction. We don't allow either.
      local buyer = redis.call('GET', buyerKey)
      if buyer then
        -- Retrying the same completed request is idempotent.
        if buyer == 'completed:' .. idempotencyKey then
          return {1}
        end

        -- The same request is already in progress.
        if buyer == 'pending:' .. idempotencyKey then
          return {2}
        end

        -- A different request from this buyer is still in progress.
        if string.sub(buyer, 1, 8) == 'pending:' then
          return {8}
        end

        -- Default if the buyer key exists then the buyer has already made some purchase
        return {3}
      end

      -- Check and decrement stock in the same atomic script.
      local currentStock = tonumber(stock)
      if currentStock <= 0 then
        return {4}
      end

      local newStock = redis.call('DECR', stockKey)

      -- Mark the buyer and reservation as pending. Both expire if the purchase
      -- never reaches the completion or release step.
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
      redisKeys.productStock(input.productId),
      redisKeys.flashSaleWindow(input.productId),
      redisKeys.productBuyer(input.productId, input.userId),
      redisKeys.productReservation(
        input.productId,
        input.userId,
        input.idempotencyKey,
      ),
    ];

    const result = await this.redis.eval(reserveStockScript, {
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

  public async markStockReservationAsCompleted(
    input: ReserveStockInput,
  ): Promise<void> {
    const markStockReservationAsCompletedScript = `
      -- Mark only the buyer and reservation created by this request as completed.
      local buyerKey = KEYS[1]
      local reservationKey = KEYS[2]
      local saleWindowKey = KEYS[3]
      local pendingValue = 'pending:' .. ARGV[1]

      -- Do not overwrite a buyer state that is no longer pending.
      if redis.call('GET', buyerKey) == pendingValue then
        local saleEnd = redis.call('HGET', saleWindowKey, 'endTime')

        if saleEnd then
          -- Retain the completed marker until one day after the sale ends so
          -- retries with the same idempotency key remain successful.
          redis.call(
            'SET',
            buyerKey,
            'completed:' .. ARGV[1],
            'PXAT',
            tonumber(saleEnd) + 86400000
          )
        else
          -- Fallback retention period if the sale window no longer exists.
          redis.call('SET', buyerKey, 'completed:' .. ARGV[1], 'EX', 86400)
        end

        -- Stock remains decremented; only the temporary reservation is removed.
        redis.call('DEL', reservationKey)
      end
    `;

    await this.redis.eval(markStockReservationAsCompletedScript, {
      keys: [
        redisKeys.productBuyer(input.productId, input.userId),
        redisKeys.productReservation(
          input.productId,
          input.userId,
          input.idempotencyKey,
        ),
        redisKeys.flashSaleWindow(input.productId),
      ],
      arguments: [input.idempotencyKey],
    });
  }

  public async releaseStockByProductId(
    input: ReleaseStockInput,
  ): Promise<void> {
    const keys = [
      redisKeys.productStock(input.productId),
      redisKeys.productBuyer(input.productId, input.userId),
      redisKeys.productReservation(
        input.productId,
        input.userId,
        input.idempotencyKey,
      ),
    ];

    const releaseStockScript = `
      -- The caller passes the stock, buyer, and reservation keys.
      local stockKey = KEYS[1]
      local buyerKey = KEYS[2]
      local reservationKey = KEYS[3]
      local pendingValue = 'pending:' .. ARGV[1]

      -- Roll back only an active reservation belonging to this request by incrementing stock and removing involved keys
      if redis.call('EXISTS', reservationKey) == 1
        and redis.call('GET', buyerKey) == pendingValue then
        -- Return stock and remove both pending markers atomically.
        redis.call('INCR', stockKey)
        redis.call('DEL', reservationKey)
        redis.call('DEL', buyerKey)
      end
    `;

    await this.redis.eval(releaseStockScript, {
      keys,
      arguments: [input.idempotencyKey],
    });
  }
}
