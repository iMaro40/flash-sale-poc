import { database } from "../database";
import { ProductNotFoundError } from "../errors/product-not-found";
import type { CreateProductInput } from "./dto/create-product";
import type { Product } from "./model";
import { ProductRepository } from "./repository";

export class ProductService {
  public constructor(private readonly productRepository: ProductRepository) {}

  public async createProduct(input: CreateProductInput): Promise<Product> {
    return this.productRepository.create(input);
  }

  public async getProductById(productId: string): Promise<Product> {
    const product = await this.productRepository.findById(productId);

    // TO DO: Caching

    if (!product) {
      throw new ProductNotFoundError(productId);
    }

    return product;
  }
}

export const productService: ProductService = new ProductService(
  new ProductRepository(database),
);
