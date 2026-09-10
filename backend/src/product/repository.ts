import type { Knex } from "knex";

import type { CreateProductInput } from "./dto/create-product";
import type { Product } from "./model";

export class ProductRepository {
  public constructor(private readonly db: Knex) {}

  public async findById(productId: string): Promise<Product | undefined> {
    return this.db<Product>("products").where("id", productId).first();
  }

  public async create(input: CreateProductInput): Promise<Product> {
    const [product] = await this.db<Product>("products")
      .insert(input)
      .returning(["id", "name", "stock"]);

    return product;
  }
}
