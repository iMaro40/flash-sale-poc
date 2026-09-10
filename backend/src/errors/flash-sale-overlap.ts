import { CustomError } from "./custom-error";

export class FlashSaleOverlapError extends CustomError {
  public constructor(productId: string) {
    super(
      `The requested flash sale time overlaps with an existing sale for product ${productId}`,
      409,
    );
    this.name = "FlashSaleOverlapError";
  }
}
