import { describe, expect, it, vi } from "vitest";

import type { ProductCache } from "./cache";
import type { CreateProductInput } from "./dto/create-product";
import type { Product } from "./model";
import type { ProductRepository } from "./repository";
import { ProductService } from "./service";

const product: Product = {
  id: "product-1",
  name: "Limited Product",
  stock: 10,
};

const createProductRepository = (): {
  findById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
} => ({
  findById: vi.fn(),
  create: vi.fn(),
});

const createProductCache = (): {
  getProductById: ReturnType<typeof vi.fn>;
  setProduct: ReturnType<typeof vi.fn>;
  reserveStockByProductId: ReturnType<typeof vi.fn>;
  releaseStockByProductId: ReturnType<typeof vi.fn>;
} => ({
  getProductById: vi.fn(),
  setProduct: vi.fn(),
  reserveStockByProductId: vi.fn(),
  releaseStockByProductId: vi.fn(),
});

describe("ProductService.getProductById", () => {
  it("returns the product from cache without querying the repository", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    productCache.getProductById.mockResolvedValue(product);
    const service = new ProductService(
      productRepository as unknown as ProductRepository,
      productCache as unknown as ProductCache,
    );

    const result = await service.getProductById(product.id);

    expect(result).toEqual(product);
    expect(productRepository.findById).not.toHaveBeenCalled();
    expect(productCache.setProduct).not.toHaveBeenCalled();
  });

  it("loads and caches the product when the cache misses", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    productCache.getProductById.mockResolvedValue(undefined);
    productRepository.findById.mockResolvedValue(product);
    const service = new ProductService(
      productRepository as unknown as ProductRepository,
      productCache as unknown as ProductCache,
    );

    const result = await service.getProductById(product.id);

    expect(result).toEqual(product);
    expect(productRepository.findById).toHaveBeenCalledWith(product.id);
    expect(productCache.setProduct).toHaveBeenCalledWith(product);
  });

  it("returns undefined and does not cache when the product does not exist", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    productCache.getProductById.mockResolvedValue(undefined);
    productRepository.findById.mockResolvedValue(undefined);
    const service = new ProductService(
      productRepository as unknown as ProductRepository,
      productCache as unknown as ProductCache,
    );

    const result = await service.getProductById(product.id);

    expect(result).toBeUndefined();
    expect(productRepository.findById).toHaveBeenCalledWith(product.id);
    expect(productCache.setProduct).not.toHaveBeenCalled();
  });

  it("returns the repository result after writing it to the cache", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    productCache.getProductById.mockResolvedValue(undefined);
    productRepository.findById.mockResolvedValue(product);
    const service = new ProductService(
      productRepository as unknown as ProductRepository,
      productCache as unknown as ProductCache,
    );

    await expect(service.getProductById(product.id)).resolves.toEqual(product);
    expect(productCache.setProduct).toHaveBeenCalledWith(product);
  });
});

describe("ProductService.createProduct", () => {
  it("returns the repository-created product and prewarms the cache", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    const input: CreateProductInput = {
      name: product.name,
      stock: product.stock,
    };
    productRepository.create.mockResolvedValue(product);
    const service = new ProductService(
      productRepository as unknown as ProductRepository,
      productCache as unknown as ProductCache,
    );

    const result = await service.createProduct(input);

    expect(result).toEqual(product);
    expect(productRepository.create).toHaveBeenCalledWith(input);
    expect(productCache.setProduct).toHaveBeenCalledWith(product);
  });
});

describe("ProductService.reserveStockByProductId", () => {
  it("delegates to ProductCache when stock key exists", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    productCache.reserveStockByProductId.mockResolvedValue(9);
    const service = new ProductService(
      productRepository as unknown as ProductRepository,
      productCache as unknown as ProductCache,
    );

    const input = {
      productId: product.id,
      userId: "user-1",
      idempotencyKey: "idem-1",
    };

    const result = await service.reserveStockByProductId(input);

    expect(result).toBe(9);
    expect(productCache.reserveStockByProductId).toHaveBeenCalledWith(input);
  });

  it("lazy prewarms cache from DB and retries reservation on cache miss", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    productCache.reserveStockByProductId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(9);
    productRepository.findById.mockResolvedValue(product);
    const service = new ProductService(
      productRepository as unknown as ProductRepository,
      productCache as unknown as ProductCache,
    );

    const input = {
      productId: product.id,
      userId: "user-1",
      idempotencyKey: "idem-1",
    };

    const result = await service.reserveStockByProductId(input);

    expect(result).toBe(9);
    expect(productRepository.findById).toHaveBeenCalledWith(product.id);
    expect(productCache.setProduct).toHaveBeenCalledWith(product);
    expect(productCache.reserveStockByProductId).toHaveBeenCalledTimes(2);
  });
});

describe("ProductService.releaseStockByProductId", () => {
  it("delegates to ProductCache", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    const service = new ProductService(
      productRepository as unknown as ProductRepository,
      productCache as unknown as ProductCache,
    );

    const input = {
      productId: product.id,
      userId: "user-1",
      idempotencyKey: "idem-1",
    };

    await service.releaseStockByProductId(input);

    expect(productCache.releaseStockByProductId).toHaveBeenCalledWith(input);
  });
});
