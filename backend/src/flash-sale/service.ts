import { database } from "../database";
import { FlashSaleOverlapError } from "../errors/flash-sale-overlap";
import { productService, ProductService } from "../product/service";
import type { CreateFlashSaleInput } from "./dto/create-flash-sale";
import { FlashSaleRepository } from "./repository";

export class FlashSaleService {
  public constructor(
    private readonly flashSaleRepository: FlashSaleRepository,
    private readonly productService: ProductService,
  ) {}

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
