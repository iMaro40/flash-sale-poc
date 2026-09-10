import { CustomError } from "./custom-error";

export class ProductNotFoundError extends CustomError {
  public constructor(productId: string) {
    super(`Product ${productId} was not found`, 404);
    this.name = "ProductNotFoundError";
  }
}
