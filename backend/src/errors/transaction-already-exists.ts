import { CustomError } from "./custom-error";

export class TransactionAlreadyExistsError extends CustomError {
  public constructor(idempotencyKey: string, userId: string) {
    super(
      `A transaction already exists for idempotency key ${idempotencyKey} and user ${userId}`,
      409,
    );
    this.name = "TransactionAlreadyExistsError";
  }
}
