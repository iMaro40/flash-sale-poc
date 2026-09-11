import type { Knex } from "knex";

import type { CreateFlashSaleInput } from "./dto/create-flash-sale";
import type { FlashSale } from "./model";

interface FlashSaleDbRow {
  id: string;
  product_id: string;
  start_time: Date;
  end_time: Date;
}

export class FlashSaleRepository {
  public constructor(private readonly db: Knex) {}

  private mapToFlashSale(row: FlashSaleDbRow): FlashSale {
    return {
      id: row.id,
      productId: row.product_id,
      startTime: row.start_time,
      endTime: row.end_time,
    };
  }

  public async findActiveFlashSaleByProductId(
    productId: string,
    now: Date,
  ): Promise<FlashSale | undefined> {
    const flashSale = await this.db<FlashSaleDbRow>("flash_sales")
      .where("product_id", productId)
      .andWhere("start_time", "<=", now)
      .andWhere("end_time", ">", now)
      .first();

    return flashSale ? this.mapToFlashSale(flashSale) : undefined;
  }

  public async findOverlappingFlashSaleByProductId(
    input: CreateFlashSaleInput,
  ): Promise<FlashSale | undefined> {
    const flashSale = await this.db<FlashSaleDbRow>("flash_sales")
      .where("product_id", input.productId)
      .andWhere("start_time", "<", input.endTime)
      .andWhere("end_time", ">", input.startTime)
      .first();

    return flashSale ? this.mapToFlashSale(flashSale) : undefined;
  }

  public async createFlashSale(input: CreateFlashSaleInput): Promise<void> {
    await this.db<FlashSaleDbRow>("flash_sales").insert({
      product_id: input.productId,
      start_time: input.startTime,
      end_time: input.endTime,
    });
  }
}
