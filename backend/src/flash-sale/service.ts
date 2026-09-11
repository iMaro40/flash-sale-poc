import { database } from "../database";
import { ProductNotFoundError } from "../errors/product-not-found";
import { FlashSaleOverlapError } from "../errors/flash-sale-overlap";
import { productService, ProductService } from "../product/service";
import type { CreateFlashSaleInput } from "./dto/create-flash-sale";
import { FlashSaleStatus, type FlashSale } from "./model";
import { FlashSaleRepository } from "./repository";

export class FlashSaleService {
  public constructor(
    private readonly flashSaleRepository: FlashSaleRepository,
    private readonly productService: ProductService,
  ) {}

  private determineFlashSaleStatus(flashSale: FlashSale): FlashSaleStatus {
    const now: Date = new Date();

    if (flashSale.startTime > now) {
      return FlashSaleStatus.Upcoming;
    }

    if (flashSale.endTime <= now) {
      return FlashSaleStatus.Ended;
    }

    return FlashSaleStatus.Active;
  }

  public async findActiveFlashSaleByProductId(
    productId: string,
  ): Promise<FlashSale | undefined> {
    const flashSale =
      await this.flashSaleRepository.findActiveFlashSaleByProductId(
        productId,
        new Date(),
      );

    // TO DO: Probably cache this?

    if (!flashSale) {
      return undefined;
    }

    return {
      ...flashSale,
      status: this.determineFlashSaleStatus(flashSale),
    };
  }

  public async createFlashSale(input: CreateFlashSaleInput): Promise<void> {
    const product = await this.productService.getProductById(input.productId);

    if (!product) {
      throw new ProductNotFoundError(input.productId);
    }

    const overlappingFlashSale =
      await this.flashSaleRepository.findOverlappingFlashSaleByProductId(input);

    if (overlappingFlashSale !== undefined) {
      throw new FlashSaleOverlapError(input.productId);
    }

    await this.flashSaleRepository.createFlashSale(input);
  }
}

const flashSaleService: FlashSaleService = new FlashSaleService(
  new FlashSaleRepository(database),
  productService,
);

export { flashSaleService };
