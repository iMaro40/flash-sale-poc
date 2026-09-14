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
    const flashSale = await this.flashSaleRepository.findById(flashSaleId);

    if (!flashSale) {
      return undefined;
    }

    return {
      ...flashSale,
      status: this.determineFlashSaleStatus(flashSale),
    };
  }

  public async getFlashSalesByProductId(
    productId: string,
  ): Promise<FlashSale[]> {
    const product = await this.productService.getProductById(productId);

    if (!product) {
      throw new ProductNotFoundError(productId);
    }

    const flashSales =
      await this.flashSaleRepository.findByProductId(productId);

    return flashSales.map((flashSale) => ({
      ...flashSale,
      status: this.determineFlashSaleStatus(flashSale),
    }));
  }

  public async findActiveFlashSaleByProductId(
    productId: string,
  ): Promise<FlashSale | undefined> {
    const now = new Date();
    const cachedFlashSale =
      await this.flashSaleCache.getActiveFlashSaleByProductId(productId);

    if (
      cachedFlashSale &&
      cachedFlashSale.startTime <= now &&
      cachedFlashSale.endTime > now
    ) {
      return {
        ...cachedFlashSale,
        status: this.determineFlashSaleStatus(cachedFlashSale),
      };
    }

    const flashSale =
      await this.flashSaleRepository.findActiveFlashSaleByProductId(
        productId,
        now,
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

    const flashSaleId = await this.flashSaleRepository.createFlashSale(input);

    await this.flashSaleCache.setActiveFlashSale({
      id: flashSaleId,
      ...input,
      status: this.determineFlashSaleStatus({
        id: flashSaleId,
        ...input,
      }),
    });

    return flashSaleId;
  }
}

const flashSaleService: FlashSaleService = new FlashSaleService(
  new FlashSaleRepository(database),
  productService,
  new FlashSaleCache(redisClient),
);

export { flashSaleService };
