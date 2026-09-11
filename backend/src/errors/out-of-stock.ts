import { CustomError } from "./custom-error";

export class OutOfStockError extends CustomError {
  public constructor(productId: string) {
    super(`Product ${productId} is out of stock`, 409);
    this.name = "OutOfStockError";
  }
}
