import { database } from "../database";
import { redisClient } from "../redis";
import { ProductCache } from "./cache";
import type { CreateProductInput } from "./dto/create-product";
import type { ReleaseStockInput, ReserveStockInput } from "./dto/reserve-stock";
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

  public async reserveStockByProductId(
    input: ReserveStockInput,
  ): Promise<number | undefined> {
    let remainingStock = await this.productCache.reserveStockByProductId(input);

    if (remainingStock === undefined) {
      // Lazy pre-warming on cache miss
      const product = await this.productRepository.findById(input.productId);
      if (product) {
        await this.productCache.setProduct(product);
        remainingStock = await this.productCache.reserveStockByProductId(input);
      }
    }

    return remainingStock;
  }

  public async releaseStockByProductId(
    input: ReleaseStockInput,
  ): Promise<void> {
    await this.productCache.releaseStockByProductId(input);
  }

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
