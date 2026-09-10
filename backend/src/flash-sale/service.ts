import { database } from "../database";
import { FlashSaleOverlapError } from "../errors/flash-sale-overlap";
import { productService, ProductService } from "../product/service";
import type { CreateFlashSaleInput } from "./dto/create-flash-sale";
import type { FlashSale } from "./model";
import { FlashSaleRepository } from "./repository";

export class FlashSaleService {
  public constructor(
    private readonly flashSaleRepository: FlashSaleRepository,
    private readonly productService: ProductService,
  ) {}

  public async findActiveFlashSaleByProductId(
    productId: string,
  ): Promise<FlashSale | undefined> {
    const flashSale =
      await this.flashSaleRepository.findActiveFlashSaleByProductId(
        productId,
        new Date(),
      );

    // TO DO: Probably cache this as well.

    if (!flashSale) {
      return undefined;
    }

    return {
      id: flashSale.id,
      productId: flashSale.product_id,
      startTime: flashSale.start_time,
      endTime: flashSale.end_time,
      status: "active",
    };
  }

  public async createFlashSale(input: CreateFlashSaleInput): Promise<void> {
    await this.productService.getProductById(input.productId);

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
