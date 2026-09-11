import type { NextFunction, Request, Response } from "express";

import type { PurchaseProductInput } from "./dto/purchase-product";
import { purchaseService } from "./service";

export const purchaseProductHandler = async (
  _: Request,
  response: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const input = response.locals.requestData as PurchaseProductInput;

    await purchaseService.purchaseProduct(input);

    return response.status(201).json({
      message: "Purchase created",
    });
  } catch (error) {
    next(error);
  }
};
