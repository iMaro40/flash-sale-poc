import type { RedisClientType } from "redis";

import { redisKeys } from "../redis/keys";
import type { FlashSale } from "./model";

export class FlashSaleCache {
  public constructor(private readonly redis: RedisClientType) {}

  public async getActiveFlashSaleByProductId(
    productId: string,
  ): Promise<FlashSale | undefined> {
    const cachedFlashSale = await this.redis.get(
      redisKeys.flashSaleDetails(productId),
    );

    if (!cachedFlashSale) {
      return undefined;
    }

    const flashSale = JSON.parse(cachedFlashSale) as FlashSale;

    return {
      ...flashSale,
      startTime: new Date(flashSale.startTime),
      endTime: new Date(flashSale.endTime),
    };
  }

  public async setActiveFlashSale(flashSale: FlashSale): Promise<void> {
    await Promise.all([
      this.redis.set(
        redisKeys.flashSaleDetails(flashSale.productId),
        JSON.stringify(flashSale),
        { EX: 300 },
      ),
      this.setFlashSaleWindow(flashSale),
    ]);
  }

  public async setFlashSaleWindow(flashSale: FlashSale): Promise<void> {
    const windowKey = redisKeys.flashSaleWindow(flashSale.productId);
    const expiresAtSeconds =
      Math.ceil(flashSale.endTime.getTime() / 1000) + 24 * 60 * 60;

    await this.redis.hSet(windowKey, {
      startTime: flashSale.startTime.getTime().toString(),
      endTime: flashSale.endTime.getTime().toString(),
    });
    await this.redis.expireAt(windowKey, expiresAtSeconds);
  }
}
