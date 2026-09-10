import { Knex } from "knex";

import { CreateFlashSaleInput } from "./dto/create-flash-sale";

interface FlashSaleDbRow {
  id: string;
  product_id: string;
  start_time: Date;
  end_time: Date;
  user_id: string;
}

export class FlashSaleRepository {
  public constructor(private readonly db: Knex) {}

  public async createFlashSale(input: CreateFlashSaleInput): Promise<void> {
    await this.db<FlashSaleDbRow>("flash_sales").insert({
      product_id: input.productId,
      start_time: input.startTime,
      end_time: input.endTime,
      user_id: input.userId,
    });
  }
}
