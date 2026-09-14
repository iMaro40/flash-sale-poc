import type { NextFunction, Request, Response } from "express";

import { withRetry } from "../utils/with-retry";
import { PurchaseAcceptanceStatus } from "./dto/purchase-acceptance";
import type { PurchaseProductInput } from "./dto/purchase-product";
import { purchaseService } from "./service";

export const purchaseProductHandler = async (
  _: Request,
  response: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const input = response.locals.requestData as PurchaseProductInput;

    const status = await withRetry(
      async (): Promise<PurchaseAcceptanceStatus> => {
        return purchaseService.purchaseProduct(input);
      },
    );

    if (status === PurchaseAcceptanceStatus.ALREADY_COMPLETED) {
      return response.status(200).json({
        message: "Purchase already completed",
      });
    }

    return response.status(202).json({
      message: "Purchase accepted, processing",
    });
  } catch (error) {
    next(error);
  }
};
