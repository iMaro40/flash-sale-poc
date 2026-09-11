import { FlashSaleNotActiveError } from "../errors/flash-sale-not-active";
import { ProductNotFoundError } from "../errors/product-not-found";
import { FlashSaleService, flashSaleService } from "../flash-sale/service";
import { ProductService, productService } from "../product/service";
import {
  TransactionService,
  transactionService,
} from "../transactions/service";

export class PurchaseService {
  public constructor(
    private readonly productService: ProductService,
    private readonly flashSaleService: FlashSaleService,
    private readonly transactionService: TransactionService,
  ) {}

  public async purchaseProduct(
    productId: string,
    userId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await this.validatePurchaseProduct(productId, userId);

    await this.transactionService.createPendingTransaction({
      idempotencyKey,
      productId,
      userId,
    });

    // TODO: Decrement stock.
  }

  private async validatePurchaseProduct(
    productId: string,
    _userId: string,
  ): Promise<void> {
    const product = await this.productService.getProductById(productId);

    if (!product) {
      throw new ProductNotFoundError(productId);
    }

    const activeFlashSale =
      await this.flashSaleService.findActiveFlashSaleByProductId(productId);

    if (!activeFlashSale) {
      throw new FlashSaleNotActiveError(productId);
    }

    // TODO: Check if user has already purchased the product.
  }
}

export const purchaseService: PurchaseService = new PurchaseService(
  productService,
  flashSaleService,
  transactionService,
);
