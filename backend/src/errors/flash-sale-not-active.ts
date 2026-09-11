import { CustomError } from "./custom-error";

export class FlashSaleNotActiveError extends CustomError {
  public constructor(productId: string) {
    super(`There is no active flash sale for product ${productId}`, 409);
    this.name = "FlashSaleNotActiveError";
  }
}
