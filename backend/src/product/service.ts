import { database } from "../database";
import { RedisUnavailableError } from "../errors/redis-unavailable";
import { redisClient } from "../redis";
import { ProductCache } from "./cache";
import type { CreateProductInput } from "./dto/create-product";
import {
  type ReleaseStockInput,
  type ReserveStockInput,
  type StockReservationResult,
  StockReservationStatus,
} from "./dto/reserve-stock";
import type { Product } from "./model";
import { ProductRepository } from "./repository";

export class ProductService {
  public constructor(
    private readonly productRepository: ProductRepository,
    private readonly productCache: ProductCache,
  ) {}

  public async createProduct(input: CreateProductInput): Promise<Product> {
    const product = await this.productRepository.create(input);
    // Prewarm product details and stock in Redis
    try {
      await this.productCache.setProduct(product);
    } catch (error) {
      throw new RedisUnavailableError(error);
    }
    return product;
  }

  // Gets from cache if available, otherwise fetches from the repository and caches it (cache-aside)
  public async getProductById(productId: string): Promise<Product | undefined> {
    const cachedProduct = await this.productCache.getProductById(productId);
    const cachedInventory =
      await this.productCache.getStockByProductId(productId);

    if (cachedProduct && cachedInventory !== undefined) {
      return {
        ...cachedProduct,
        stock: cachedInventory,
      };
    }

    const product: Product | undefined =
      await this.productRepository.findById(productId);

    if (product) {
      await this.productCache.setProduct(product);
    }
    if (cachedInventory === undefined) {
      await this.productCache.setStockByProductId(
        productId,
        product?.stock ?? 0,
      );
    }

    return product;
  }

  public async reserveStockByProductId(
    input: ReserveStockInput,
  ): Promise<StockReservationResult> {
    let reservation: StockReservationResult;
    try {
      reservation = await this.productCache.reserveStockByProductId(input);
    } catch (error) {
      throw new RedisUnavailableError(error);
    }

    if (reservation.status !== StockReservationStatus.PRODUCT_CACHE_MISSING) {
      return reservation;
    }

    // Cache stock data and try to reserve again once
    const product = await this.productRepository.findById(input.productId);
    if (!product) {
      return reservation;
    }

    await this.productCache.setProduct(product);
    try {
      reservation = await this.productCache.reserveStockByProductId(input);
    } catch (error) {
      throw new RedisUnavailableError(error);
    }

    return reservation;
  }

  public async markStockReservationAsCompleted(
    input: ReserveStockInput,
  ): Promise<void> {
    await this.productCache.markStockReservationAsCompleted(input);
  }

  public async releaseStockByProductId(
    input: ReleaseStockInput,
  ): Promise<void> {
    await this.productCache.releaseStockByProductId(input);
  }
}

export const productService: ProductService = new ProductService(
  new ProductRepository(database),
  new ProductCache(redisClient),
);
