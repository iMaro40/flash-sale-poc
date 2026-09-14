import { CustomError } from "./custom-error";

export class ProductAlreadyExistsError extends CustomError {
  public constructor() {
    super("Only one product is allowed. Use the existing product for flash sales and purchases.", 409);
    this.name = "ProductAlreadyExistsError";
  }
}
