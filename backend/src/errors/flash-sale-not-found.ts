import { CustomError } from "./custom-error";

export class FlashSaleNotFoundError extends CustomError {
  public constructor(flashSaleId: string) {
    super(`Flash sale ${flashSaleId} was not found`, 404);
    this.name = "FlashSaleNotFoundError";
  }
}
