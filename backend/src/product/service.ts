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
    // Prewarm product stock in Redis
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

  public async deleteProductDetailsCache(productId: string): Promise<void> {
    await this.productCache.deleteProductDetails(productId);
  }

  public async reserveStockByProductId(
    input: ReserveStockInput,
  ): Promise<StockReservationResult> {
    let reservation = await this.productCache.reserveStockByProductId(input);

    if (reservation.status === StockReservationStatus.PRODUCT_CACHE_MISSING) {
      // Lazy pre-warming on cache miss
      const product = await this.productRepository.findById(input.productId);
      if (product) {
        await this.productCache.setProduct(product);
        reservation = await this.productCache.reserveStockByProductId(input);
      }
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

  // Simple reconciliation logic for demonstration purposes
  // Has an edge case where stock might be incorrect if stock is updated while a purchase is being processed
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
