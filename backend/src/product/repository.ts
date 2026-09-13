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

  public async decrementStockByProductId(productId: string): Promise<number> {
    try {
      const result = await this.db<Product>("products")
        .where("id", productId)
        .where("stock", ">", 0)
        .decrement("stock", 1);

      return result;
    } catch (error) {
      console.error("Failed to decrement stock:", error);
      throw error;
    }
  }
}
