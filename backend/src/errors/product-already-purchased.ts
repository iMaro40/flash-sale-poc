import { CustomError } from "./custom-error";

export class ProductAlreadyPurchasedError extends CustomError {
  public constructor(userId: string, productId: string) {
    super(`User ${userId} has already purchased product ${productId}`, 409);
    this.name = "ProductAlreadyPurchasedError";
  }
}
