import type { Knex } from "knex";

import { createDurationSampler, type DurationStats } from "../utils/duration-sampler";
import type { CreateProductInput } from "./dto/create-product";
import type { Product } from "./model";

// Time spent inside the locking UPDATE itself: for a single-row decrement, that's almost entirely
// time spent waiting for Postgres to grant the row lock, not query execution time.
const stockDecrementDurationSampler = createDurationSampler(2000);

export const getStockDecrementLockWaitStats = (): DurationStats =>
  stockDecrementDurationSampler.stats();

export class ProductRepository {
  public constructor(private readonly db: Knex) {}

  public async findById(productId: string): Promise<Product | undefined> {
    return this.db<Product>("products").where("id", productId).first();
  }

  public async findAll(): Promise<Product[]> {
    return this.db<Product>("products").select("id", "name", "stock");
  }

  public async create(input: CreateProductInput): Promise<Product> {
    const [product] = await this.db<Product>("products")
      .insert(input)
      .returning(["id", "name", "stock"]);

    return product;
  }

  public async decrementStockByProductId(productId: string): Promise<number> {
    const startedAt = Date.now();
    try {
      const result = await this.db<Product>("products")
        .where("id", productId)
        .where("stock", ">", 0)
        .decrement("stock", 1);

      stockDecrementDurationSampler.record(Date.now() - startedAt);
      return result;
    } catch (error) {
      stockDecrementDurationSampler.record(Date.now() - startedAt);
      console.error("Failed to decrement stock:", error);
      throw error;
    }
  }
}
