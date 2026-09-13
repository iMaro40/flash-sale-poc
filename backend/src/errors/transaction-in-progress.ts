import { CustomError } from "./custom-error";

export class TransactionInProgressError extends CustomError {
  public constructor(productId?: string) {
    super(
      productId
        ? `A transaction is in progress for product ${productId}`
        : "A transaction is in progress for this product",
      409,
    );
    this.name = "TransactionInProgressError";
  }
}
