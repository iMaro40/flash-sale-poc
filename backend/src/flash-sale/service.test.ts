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
} => ({
  getActiveFlashSaleByProductId: vi.fn(),
  setActiveFlashSale: vi.fn(),
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
  it("returns the repository result", async () => {
    const { service, repository } = createService();
    const flashSale = createFlashSale();
    repository.findById.mockResolvedValue(flashSale);

    const result = await service.getFlashSaleById(flashSale.id);

    expect(result).toEqual(flashSale);
    expect(repository.findById).toHaveBeenCalledWith(flashSale.id);
  });

  it("returns undefined when the flash sale does not exist", async () => {
    const { service, repository } = createService();
    repository.findById.mockResolvedValue(undefined);

    const result = await service.getFlashSaleById("missing-id");

    expect(result).toBeUndefined();
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
    expect(repository.findActiveFlashSaleByProductId).not.toHaveBeenCalled();
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
    startTime: new Date("2026-09-12T10:00:00.000Z"),
    endTime: new Date("2026-09-12T11:00:00.000Z"),
  };

  it("creates a flash sale for an existing product without overlap", async () => {
    const { service, productService, repository } = createService();
    productService.getProductById.mockResolvedValue(product);
    repository.findOverlappingFlashSaleByProductId.mockResolvedValue(undefined);
    repository.createFlashSale.mockResolvedValue("flash-sale-1");

    const result = await service.createFlashSale(input);

    expect(result).toBe("flash-sale-1");
    expect(repository.createFlashSale).toHaveBeenCalledWith(input);
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
