import { database } from "../database";
import { ProductNotFoundError } from "../errors/product-not-found";
import { FlashSaleOverlapError } from "../errors/flash-sale-overlap";
import { productService, ProductService } from "../product/service";
import { redisClient } from "../redis";
import { FlashSaleCache } from "./cache";
import type { CreateFlashSaleInput } from "./dto/create-flash-sale";
import { FlashSaleStatus, type FlashSale } from "./model";
import { FlashSaleRepository } from "./repository";

export class FlashSaleService {
  public constructor(
    private readonly flashSaleRepository: FlashSaleRepository,
    private readonly productService: ProductService,
    private readonly flashSaleCache: FlashSaleCache,
  ) {}

  private determineFlashSaleStatus(flashSale: FlashSale): FlashSaleStatus {
    const now: Date = new Date();

    if (flashSale.startTime > now) {
      return FlashSaleStatus.UPCOMING;
    }

    if (flashSale.endTime < now) {
      return FlashSaleStatus.ENDED;
    }

    return FlashSaleStatus.ACTIVE;
  }

  public async getFlashSaleById(
    flashSaleId: string,
  ): Promise<FlashSale | undefined> {
    return this.flashSaleRepository.findById(flashSaleId);
  }

  public async findActiveFlashSaleByProductId(
    productId: string,
  ): Promise<FlashSale | undefined> {
    const cachedFlashSale =
      await this.flashSaleCache.getActiveFlashSaleByProductId(productId);

    if (cachedFlashSale && cachedFlashSale.endTime > new Date()) {
      return {
        ...cachedFlashSale,
        status: this.determineFlashSaleStatus(cachedFlashSale),
      };
    }

    const flashSale =
      await this.flashSaleRepository.findActiveFlashSaleByProductId(
        productId,
        new Date(),
      );

    if (!flashSale) {
      return undefined;
    }

    const activeFlashSale: FlashSale = {
      ...flashSale,
      status: this.determineFlashSaleStatus(flashSale),
    };

    await this.flashSaleCache.setActiveFlashSale(activeFlashSale);

    return activeFlashSale;
  }

  public async createFlashSale(input: CreateFlashSaleInput): Promise<string> {
    const product = await this.productService.getProductById(input.productId);

    if (!product) {
      throw new ProductNotFoundError(input.productId);
    }

    const overlappingFlashSale =
      await this.flashSaleRepository.findOverlappingFlashSaleByProductId(input);

    if (overlappingFlashSale !== undefined) {
      throw new FlashSaleOverlapError(input.productId);
    }

    return this.flashSaleRepository.createFlashSale(input);
  }
}

const flashSaleService: FlashSaleService = new FlashSaleService(
  new FlashSaleRepository(database),
  productService,
  new FlashSaleCache(redisClient),
);

export { flashSaleService };
