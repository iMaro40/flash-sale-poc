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

  public async findOverlappingFlashSaleByProductId(
    input: CreateFlashSaleInput,
  ): Promise<FlashSaleDbRow | undefined> {
    return this.db<FlashSaleDbRow>("flash_sales")
      .where("product_id", input.productId)
      .andWhere("start_time", "<", input.endTime)
      .andWhere("end_time", ">", input.startTime)
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
