import { CustomError } from "./custom-error";

export class DuplicateTransactionError extends CustomError {
  public constructor(idempotencyKey: string) {
    super(
      `A duplicate transaction with idempotency key ${idempotencyKey} is currently in progress`,
      409,
    );
    this.name = "DuplicateTransactionError";
  }
}
