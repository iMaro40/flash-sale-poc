import type { Knex } from "knex";

import type { CreateFlashSaleInput } from "./dto/create-flash-sale";

interface FlashSaleDbRow {
  id: string;
  product_id: string;
  start_time: Date;
  end_time: Date;
}

export class FlashSaleRepository {
  public constructor(private readonly db: Knex) {}

  public async findActiveFlashSaleByProductId(
    productId: string,
  ): Promise<FlashSaleDbRow | undefined> {
    const now: Date = new Date();

    return this.db<FlashSaleDbRow>("flash_sales")
      .where("product_id", productId)
      .andWhere("start_time", "<=", now)
      .andWhere("end_time", ">", now)
      .first();
  }

  public async createFlashSale(input: CreateFlashSaleInput): Promise<void> {
    await this.db<FlashSaleDbRow>("flash_sales").insert({
      product_id: input.productId,
      start_time: input.startTime,
      end_time: input.endTime,
    });
  }
}
