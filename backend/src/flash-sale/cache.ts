import type { RedisClientType } from "redis";

import type { FlashSale } from "./model";

// Methods wrapped in try-catch blocks so that Redis errors do not block purchase requests
export class FlashSaleCache {
  public constructor(private readonly redis: RedisClientType) {}

  public async getActiveFlashSaleByProductId(
    productId: string,
  ): Promise<FlashSale | undefined> {
    try {
      const cachedFlashSale = await this.redis.get(`flash-sale:${productId}`);

      if (!cachedFlashSale) {
        return undefined;
      }

      const flashSale = JSON.parse(cachedFlashSale) as FlashSale;

      return {
        ...flashSale,
        startTime: new Date(flashSale.startTime),
        endTime: new Date(flashSale.endTime),
      };
    } catch (e) {
      console.error("Failed to get flash sale from cache", e);
      return undefined;
    }
  }

  public async setActiveFlashSale(flashSale: FlashSale): Promise<void> {
    try {
      await this.redis.set(
        `flash-sale:${flashSale.productId}`,
        JSON.stringify(flashSale),
        { EX: 300 },
      );
    } catch (e) {
      console.error("Failed to set flash sale in cache", e);
    }
  }
}
