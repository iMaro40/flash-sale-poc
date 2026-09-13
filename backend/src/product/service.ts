import { database } from "../database";
import { redisClient } from "../redis";
import { ProductCache } from "./cache";
import type { CreateProductInput } from "./dto/create-product";
import type { Product } from "./model";
import { ProductRepository } from "./repository";

export class ProductService {
  public constructor(
    private readonly productRepository: ProductRepository,
    private readonly productCache: ProductCache,
  ) {}

  public async createProduct(input: CreateProductInput): Promise<Product> {
    return this.productRepository.create(input);
  }

  // Gets from cache if available, otherwise fetches from the repository and caches it (cache-aside)
  public async getProductById(productId: string): Promise<Product | undefined> {
    const cachedProduct = await this.productCache.getProductById(productId);

    if (cachedProduct) {
      return cachedProduct;
    }

    const product: Product | undefined =
      await this.productRepository.findById(productId);

    if (product) {
      await this.productCache.setProduct(product);
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

  public async deleteProductCache(productId: string): Promise<void> {
    await this.productCache.deleteProduct(productId);
  }
}

export const productService: ProductService = new ProductService(
  new ProductRepository(database),
  new ProductCache(redisClient),
);
