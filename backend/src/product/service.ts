import { database } from "../database";
import { redisClient } from "../redis";
import type { CreateProductInput } from "./dto/create-product";
import type { Product } from "./model";
import { ProductRepository } from "./repository";
import type { RedisClientType } from "redis";

export class ProductService {
  public constructor(
    private readonly productRepository: ProductRepository,
    private readonly redis: RedisClientType,
  ) {}

  public async createProduct(input: CreateProductInput): Promise<Product> {
    return this.productRepository.create(input);
  }

  public async getProductById(productId: string): Promise<Product | undefined> {
    const cacheKey = `product:${productId}`;
    const cachedProduct = await this.redis.get(cacheKey);

    if (cachedProduct) {
      return JSON.parse(cachedProduct) as Product;
    }

    const product: Product | undefined =
      await this.productRepository.findById(productId);

    if (product) {
      // Arbitrary 5 minute TTL for this assignment. Can be longer/shorter depending on production use case
      await this.redis.set(cacheKey, JSON.stringify(product), { EX: 300 });
    }

    return product;
  }

  public async getStockByProductId(
    productId: string,
  ): Promise<number | undefined> {
    // TO DO: Cache this.
    const product = await this.getProductById(productId);

    return product?.stock;
  }
}

export const productService: ProductService = new ProductService(
  new ProductRepository(database),
  redisClient,
);
