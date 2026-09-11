import { CustomError } from "./custom-error";

export class InvalidTransactionStatusError extends CustomError {
  public constructor(status: string) {
    super(`Invalid transaction status: ${status}`, 400);
    this.name = "InvalidTransactionStatusError";
  }
}
