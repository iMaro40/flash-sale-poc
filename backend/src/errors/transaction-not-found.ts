import { CustomError } from "./custom-error";

export class TransactionNotFoundError extends CustomError {
  public constructor(userId: string, productId: string) {
    super(
      `Transaction for user ${userId} and product ${productId} was not found`,
      404,
    );
    this.name = "TransactionNotFoundError";
  }
}
