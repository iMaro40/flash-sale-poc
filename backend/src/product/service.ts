import { database } from "../database";
import { ProductNotFoundError } from "../errors/product-not-found";
import type { CreateProductInput } from "./dto/create-product";
import { ProductRepository } from "./repository";
import type { Product } from "./model";

const productRepository: ProductRepository = new ProductRepository(database);

export const createProduct = async (
  input: CreateProductInput,
): Promise<Product> => {
  return productRepository.create(input);
};

export const getProductById = async (productId: string): Promise<Product> => {
  const product = await productRepository.findById(productId);

  // TO DO: Caching

  if (!product) {
    throw new ProductNotFoundError(productId);
  }

  return product;
};
