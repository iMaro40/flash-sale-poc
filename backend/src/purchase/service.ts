import { TransactionAlreadyExistsError } from "../errors/transaction-already-exists";
import { FlashSaleNotActiveError } from "../errors/flash-sale-not-active";
import { ProductNotFoundError } from "../errors/product-not-found";
import { FlashSaleService, flashSaleService } from "../flash-sale/service";
import { ProductService, productService } from "../product/service";
import {
  TransactionService,
  transactionService,
} from "../transactions/service";
import type { PurchaseProductInput } from "./dto/purchase-product";

export class PurchaseService {
  public constructor(
    private readonly productService: ProductService,
    private readonly flashSaleService: FlashSaleService,
    private readonly transactionService: TransactionService,
  ) {}

  public async purchaseProduct(input: PurchaseProductInput): Promise<void> {
    await this.validatePurchaseProduct(input);

    await this.transactionService.createPendingTransaction({
      idempotencyKey: input.idempotencyKey,
      productId: input.productId,
      userId: input.userId,
    });

    // TODO: Decrement stock.
  }

  private async validatePurchaseProduct(
    input: PurchaseProductInput,
  ): Promise<void> {
    const product = await this.productService.getProductById(input.productId);

    if (!product) {
      throw new ProductNotFoundError(input.productId);
    }

    const activeFlashSale =
      await this.flashSaleService.findActiveFlashSaleByProductId(
        input.productId,
      );

    if (!activeFlashSale) {
      throw new FlashSaleNotActiveError(input.productId);
    }

    const existingTransaction =
      await this.transactionService.getTransactionByIdempotencyKeyAndUserId(
        input.idempotencyKey,
        input.userId,
      );

    if (existingTransaction) {
      throw new TransactionAlreadyExistsError(
        input.idempotencyKey,
        input.userId,
      );
    }
  }
}

export const purchaseService: PurchaseService = new PurchaseService(
  productService,
  flashSaleService,
  transactionService,
);
