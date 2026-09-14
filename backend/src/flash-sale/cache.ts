import type { RedisClientType } from "redis";

import { redisKeys } from "../redis/keys";
import type { FlashSale } from "./model";

export class FlashSaleCache {
  public constructor(private readonly redis: RedisClientType) {}

  public async getActiveFlashSaleByProductId(
    productId: string,
  ): Promise<FlashSale | undefined> {
    const cachedFlashSale = await this.redis.hGetAll(
      redisKeys.flashSale(productId),
    );

    if (Object.keys(cachedFlashSale).length === 0) {
      return undefined;
    }

    return {
      id: cachedFlashSale.id,
      productId: cachedFlashSale.productId,
      startTime: new Date(Number(cachedFlashSale.startTime)),
      endTime: new Date(Number(cachedFlashSale.endTime)),
      status: cachedFlashSale.status as FlashSale["status"],
    };
  }

  public async setActiveFlashSale(flashSale: FlashSale): Promise<void> {
    const oneDayInSeconds = 24 * 60 * 60;
    const flashSaleCacheExpiresAtSeconds =
      Math.ceil(flashSale.endTime.getTime() / 1000) + oneDayInSeconds;

    const flashSaleKey = redisKeys.flashSale(flashSale.productId);
    await this.redis.hSet(flashSaleKey, {
      id: flashSale.id,
      productId: flashSale.productId,
      startTime: flashSale.startTime.getTime().toString(),
      endTime: flashSale.endTime.getTime().toString(),
      status: flashSale.status ?? "",
    });
    await this.redis.expireAt(flashSaleKey, flashSaleCacheExpiresAtSeconds);
  }
}
