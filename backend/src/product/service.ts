import { database } from "../database";
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
    await this.productCache.setProduct(product);
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
    if (!cachedInventory) {
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
    let reservation = await this.productCache.reserveStockByProductId(input);

    if (reservation.status !== StockReservationStatus.PRODUCT_CACHE_MISSING) {
      return reservation;
    }

    // Cache stock data and try to reserve again once
    const product = await this.productRepository.findById(input.productId);
    if (!product) {
      return reservation;
    }

    await this.productCache.setProduct(product);
    reservation = await this.productCache.reserveStockByProductId(input);

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

  // Simple reconciliation logic of Redis stock for demonstration purposes
  // Not the most robust implementation right now: might incorrectly overwrite Redis with the wrong state
  // At the very least, this will not result in actual overselling/underselling since DB has the correct stock values
  // A more robust solution would maybe involve recording purchase attempts and firing specific events on expiration
  public async reconcileStock(): Promise<number> {
    const products = await this.productRepository.findAll();

    for (const product of products) {
      await this.productCache.setStockByProductId(product.id, product.stock);
    }

    return products.length;
  }
}

export const productService: ProductService = new ProductService(
  new ProductRepository(database),
  new ProductCache(redisClient),
);
