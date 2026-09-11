import { database } from "../database";
import type { CreateProductInput } from "./dto/create-product";
import type { Product } from "./model";
import { ProductRepository } from "./repository";

export class ProductService {
  public constructor(private readonly productRepository: ProductRepository) {}

  public async createProduct(input: CreateProductInput): Promise<Product> {
    return this.productRepository.create(input);
  }

  public async getProductById(productId: string): Promise<Product | undefined> {
    const product: Product | undefined =
      await this.productRepository.findById(productId);

    // TO DO: Cache this maybe?

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
);
