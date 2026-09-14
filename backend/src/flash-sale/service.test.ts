import { describe, expect, it, vi } from "vitest";

import { ProductNotFoundError } from "../errors/product-not-found";
import { FlashSaleOverlapError } from "../errors/flash-sale-overlap";
import type { ProductService } from "../product/service";
import type { FlashSaleCache } from "./cache";
import type { CreateFlashSaleInput } from "./dto/create-flash-sale";
import { FlashSaleStatus, type FlashSale } from "./model";
import type { FlashSaleRepository } from "./repository";
import { FlashSaleService } from "./service";

const product = {
  id: "product-1",
  name: "Limited Product",
  stock: 10,
};

const createFlashSale = (overrides: Partial<FlashSale> = {}): FlashSale => ({
  id: "flash-sale-1",
  productId: product.id,
  startTime: new Date("2026-09-12T10:00:00.000Z"),
  endTime: new Date("2026-09-12T11:00:00.000Z"),
  ...overrides,
});

const createFlashSaleRepository = (): Record<
  string,
  ReturnType<typeof vi.fn>
> => ({
  findById: vi.fn(),
  findByProductId: vi.fn(),
  findActiveFlashSaleByProductId: vi.fn(),
  findOverlappingFlashSaleByProductId: vi.fn(),
  createFlashSale: vi.fn(),
});

const createProductService = (): {
  getProductById: ReturnType<typeof vi.fn>;
} => ({
  getProductById: vi.fn(),
});

const createFlashSaleCache = (): {
  getActiveFlashSaleByProductId: ReturnType<typeof vi.fn>;
  setActiveFlashSale: ReturnType<typeof vi.fn>;
  setFlashSaleWindow: ReturnType<typeof vi.fn>;
} => ({
  getActiveFlashSaleByProductId: vi.fn(),
  setActiveFlashSale: vi.fn(),
  setFlashSaleWindow: vi.fn(),
});

const createService = (): {
  service: FlashSaleService;
  repository: ReturnType<typeof createFlashSaleRepository>;
  productService: ReturnType<typeof createProductService>;
  cache: ReturnType<typeof createFlashSaleCache>;
} => {
  const repository = createFlashSaleRepository();
  const productService = createProductService();
  const cache = createFlashSaleCache();
  const service = new FlashSaleService(
    repository as unknown as FlashSaleRepository,
    productService as unknown as ProductService,
    cache as unknown as FlashSaleCache,
  );

  return { service, repository, productService, cache };
};

describe("FlashSaleService.getFlashSaleById", () => {
  it("returns a flash sale with calculated status when found", async () => {
    const { service, repository } = createService();
    const flashSale = createFlashSale({
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date(Date.now() + 60_000),
    });
    repository.findById.mockResolvedValue(flashSale);

    const result = await service.getFlashSaleById("flash-sale-1");

    expect(result).toEqual({
      ...flashSale,
      status: FlashSaleStatus.ACTIVE,
    });
    expect(repository.findById).toHaveBeenCalledWith("flash-sale-1");
  });

  it("returns undefined when flash sale is not found", async () => {
    const { service, repository } = createService();
    repository.findById.mockResolvedValue(undefined);

    const result = await service.getFlashSaleById("missing-flash-sale-id");

    expect(result).toBeUndefined();
    expect(repository.findById).toHaveBeenCalledWith("missing-flash-sale-id");
  });
});

describe("FlashSaleService.getFlashSalesByProductId", () => {
  it("returns flash sales for an existing product with calculated status", async () => {
    const { service, productService, repository } = createService();
    const flashSale = createFlashSale({
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date(Date.now() + 60_000),
    });
    productService.getProductById.mockResolvedValue(product);
    repository.findByProductId.mockResolvedValue([flashSale]);

    const result = await service.getFlashSalesByProductId(product.id);

    expect(result).toEqual([
      {
        ...flashSale,
        status: FlashSaleStatus.ACTIVE,
      },
    ]);
    expect(productService.getProductById).toHaveBeenCalledWith(product.id);
    expect(repository.findByProductId).toHaveBeenCalledWith(product.id);
  });

  it("throws ProductNotFoundError when the product does not exist", async () => {
    const { service, productService, repository } = createService();
    productService.getProductById.mockResolvedValue(undefined);

    await expect(
      service.getFlashSalesByProductId("missing-product-id"),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(repository.findByProductId).not.toHaveBeenCalled();
  });
});

describe("FlashSaleService.findActiveFlashSaleByProductId", () => {
  it("returns an active cached flash sale without querying the repository", async () => {
    const { service, cache, repository } = createService();
    const flashSale = createFlashSale({
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date(Date.now() + 60_000),
    });
    cache.getActiveFlashSaleByProductId.mockResolvedValue(flashSale);

    const result = await service.findActiveFlashSaleByProductId(product.id);

    expect(result).toMatchObject({
      ...flashSale,
      status: FlashSaleStatus.ACTIVE,
    });
    expect(cache.setFlashSaleWindow).toHaveBeenCalledWith(flashSale);
    expect(repository.findActiveFlashSaleByProductId).not.toHaveBeenCalled();
  });

  it("ignores an upcoming cached flash sale and queries the repository", async () => {
    const { service, cache, repository } = createService();
    const upcomingFlashSale = createFlashSale({
      startTime: new Date(Date.now() + 60_000),
      endTime: new Date(Date.now() + 120_000),
    });
    cache.getActiveFlashSaleByProductId.mockResolvedValue(upcomingFlashSale);
    repository.findActiveFlashSaleByProductId.mockResolvedValue(undefined);

    const result = await service.findActiveFlashSaleByProductId(product.id);

    expect(result).toBeUndefined();
    expect(repository.findActiveFlashSaleByProductId).toHaveBeenCalledWith(
      product.id,
      expect.any(Date),
    );
  });

  it("loads and caches an active flash sale after a cache miss", async () => {
    const { service, cache, repository } = createService();
    const flashSale = createFlashSale({
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date(Date.now() + 60_000),
    });
    cache.getActiveFlashSaleByProductId.mockResolvedValue(undefined);
    repository.findActiveFlashSaleByProductId.mockResolvedValue(flashSale);

    const result = await service.findActiveFlashSaleByProductId(product.id);

    expect(result).toMatchObject({
      ...flashSale,
      status: FlashSaleStatus.ACTIVE,
    });
    expect(repository.findActiveFlashSaleByProductId).toHaveBeenCalledWith(
      product.id,
      expect.any(Date),
    );
    expect(cache.setActiveFlashSale).toHaveBeenCalledWith({
      ...flashSale,
      status: FlashSaleStatus.ACTIVE,
    });
  });

  it("returns undefined when no active flash sale exists", async () => {
    const { service, cache, repository } = createService();
    cache.getActiveFlashSaleByProductId.mockResolvedValue(undefined);
    repository.findActiveFlashSaleByProductId.mockResolvedValue(undefined);

    const result = await service.findActiveFlashSaleByProductId(product.id);

    expect(result).toBeUndefined();
    expect(cache.setActiveFlashSale).not.toHaveBeenCalled();
  });
});

describe("FlashSaleService.createFlashSale", () => {
  const input: CreateFlashSaleInput = {
    productId: product.id,
    startTime: new Date(Date.now() + 60_000),
    endTime: new Date(Date.now() + 120_000),
  };

  it("creates a flash sale for an existing product without overlap", async () => {
    const { service, productService, repository } = createService();
    productService.getProductById.mockResolvedValue(product);
    repository.findOverlappingFlashSaleByProductId.mockResolvedValue(undefined);
    repository.createFlashSale.mockResolvedValue("flash-sale-1");

    const result = await service.createFlashSale(input);

    expect(result).toBe("flash-sale-1");
    expect(repository.createFlashSale).toHaveBeenCalledWith(input);
    expect(cache.setFlashSaleWindow).toHaveBeenCalledWith({
      id: "flash-sale-1",
      ...input,
      status: FlashSaleStatus.UPCOMING,
    });
  });

  it("throws when the product does not exist", async () => {
    const { service, productService, repository } = createService();
    productService.getProductById.mockResolvedValue(undefined);

    await expect(service.createFlashSale(input)).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
    expect(
      repository.findOverlappingFlashSaleByProductId,
    ).not.toHaveBeenCalled();
  });

  it("throws when the flash sale overlaps an existing sale", async () => {
    const { service, productService, repository } = createService();
    productService.getProductById.mockResolvedValue(product);
    repository.findOverlappingFlashSaleByProductId.mockResolvedValue(
      createFlashSale(),
    );

    await expect(service.createFlashSale(input)).rejects.toBeInstanceOf(
      FlashSaleOverlapError,
    );
    expect(repository.createFlashSale).not.toHaveBeenCalled();
  });
});
