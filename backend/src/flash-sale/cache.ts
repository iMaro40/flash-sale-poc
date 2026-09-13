import type { RedisClientType } from "redis";

import type { FlashSale } from "./model";

export class FlashSaleCache {
  public constructor(private readonly redis: RedisClientType) {}

  public async getActiveFlashSaleByProductId(
    productId: string,
  ): Promise<FlashSale | undefined> {
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
  }

  public async setActiveFlashSale(flashSale: FlashSale): Promise<void> {
    await this.redis.set(
      `flash-sale:${flashSale.productId}`,
      JSON.stringify(flashSale),
      { EX: 300 },
    );
  }
}
