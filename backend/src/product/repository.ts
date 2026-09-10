import type { Knex } from "knex";

import type { Product } from "./model";

export class ProductRepository {
  public constructor(private readonly db: Knex) {}

  public async findById(productId: string): Promise<Product | undefined> {
    return this.db<Product>("products").where("id", productId).first();
  }
}
