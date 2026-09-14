import { describe, expect, it, vi } from "vitest";

import type { ProductCache } from "./cache";
import type { CreateProductInput } from "./dto/create-product";
import { StockReservationStatus } from "./dto/reserve-stock";
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
  getStockByProductId: ReturnType<typeof vi.fn>;
  setProduct: ReturnType<typeof vi.fn>;
  setStockByProductId: ReturnType<typeof vi.fn>;
  deleteProductDetails: ReturnType<typeof vi.fn>;
  reserveStockByProductId: ReturnType<typeof vi.fn>;
  markStockReservationAsCompleted: ReturnType<typeof vi.fn>;
  releaseStockByProductId: ReturnType<typeof vi.fn>;
} => ({
  getProductById: vi.fn(),
  getStockByProductId: vi.fn(),
  setProduct: vi.fn(),
  setStockByProductId: vi.fn(),
  deleteProductDetails: vi.fn(),
  reserveStockByProductId: vi.fn(),
  markStockReservationAsCompleted: vi.fn(),
  releaseStockByProductId: vi.fn(),
});

describe("ProductService.getProductById", () => {
  it("returns the product from cache without querying the repository", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    productCache.getProductById.mockResolvedValue(product);
    productCache.getStockByProductId.mockResolvedValue(product.stock);
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
    productCache.getStockByProductId.mockResolvedValue(undefined);
    productRepository.findById.mockResolvedValue(product);
    const service = new ProductService(
      productRepository as unknown as ProductRepository,
      productCache as unknown as ProductCache,
    );

    const result = await service.getProductById(product.id);

    expect(result).toEqual(product);
    expect(productRepository.findById).toHaveBeenCalledWith(product.id);
    expect(productCache.setProduct).toHaveBeenCalledWith(product);
    expect(productCache.setStockByProductId).toHaveBeenCalledWith(
      product.id,
      product.stock,
    );
  });

  it("returns undefined and does not cache when the product does not exist", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    productCache.getProductById.mockResolvedValue(undefined);
    productCache.getStockByProductId.mockResolvedValue(undefined);
    productRepository.findById.mockResolvedValue(undefined);
    const service = new ProductService(
      productRepository as unknown as ProductRepository,
      productCache as unknown as ProductCache,
    );

    const result = await service.getProductById(product.id);

    expect(result).toBeUndefined();
    expect(productRepository.findById).toHaveBeenCalledWith(product.id);
    expect(productCache.setProduct).not.toHaveBeenCalled();
    expect(productCache.setStockByProductId).toHaveBeenCalledWith(
      product.id,
      0,
    );
  });

  it("returns the repository result after writing it to the cache", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    productCache.getProductById.mockResolvedValue(undefined);
    productCache.getStockByProductId.mockResolvedValue(undefined);
    productRepository.findById.mockResolvedValue(product);
    const service = new ProductService(
      productRepository as unknown as ProductRepository,
      productCache as unknown as ProductCache,
    );

    await expect(service.getProductById(product.id)).resolves.toEqual(product);
    expect(productCache.setProduct).toHaveBeenCalledWith(product);
    expect(productCache.setStockByProductId).toHaveBeenCalledWith(
      product.id,
      product.stock,
    );
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

describe("ProductService.deleteProductDetailsCache", () => {
  it("delegates deleting cached product details to ProductCache", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    const service = new ProductService(
      productRepository as unknown as ProductRepository,
      productCache as unknown as ProductCache,
    );

    await service.deleteProductDetailsCache(product.id);

    expect(productCache.deleteProductDetails).toHaveBeenCalledWith(product.id);
  });
});

describe("ProductService.reserveStockByProductId", () => {
  it("delegates to ProductCache when stock key exists", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    productCache.reserveStockByProductId.mockResolvedValue({
      status: StockReservationStatus.RESERVED,
      remainingStock: 9,
    });
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

    expect(result).toEqual({
      status: StockReservationStatus.RESERVED,
      remainingStock: 9,
    });
    expect(productCache.reserveStockByProductId).toHaveBeenCalledWith(input);
  });

  it("lazy prewarms cache from DB and retries reservation on cache miss", async () => {
    const productRepository = createProductRepository();
    const productCache = createProductCache();
    productCache.reserveStockByProductId
      .mockResolvedValueOnce({
        status: StockReservationStatus.PRODUCT_CACHE_MISSING,
      })
      .mockResolvedValueOnce({
        status: StockReservationStatus.RESERVED,
        remainingStock: 9,
      });
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

    expect(result).toEqual({
      status: StockReservationStatus.RESERVED,
      remainingStock: 9,
    });
    expect(productRepository.findById).toHaveBeenCalledWith(product.id);
    expect(productCache.setProduct).toHaveBeenCalledWith(product);
    expect(productCache.reserveStockByProductId).toHaveBeenCalledTimes(2);
  });
});

describe("ProductService.markStockReservationAsCompleted", () => {
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

    await service.markStockReservationAsCompleted(input);

    expect(productCache.markStockReservationAsCompleted).toHaveBeenCalledWith(
      input,
    );
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
