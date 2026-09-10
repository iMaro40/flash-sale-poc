import type { NextFunction, Request, Response } from "express";

import type { CreateFlashSaleInput } from "./dto/create-flash-sale";
import { createFlashSale } from "./service";

export const createFlashSaleHandler = async (
  _: Request,
  response: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const { productId, startTime, endTime } = response.locals
      .requestData as CreateFlashSaleInput;

    const input: CreateFlashSaleInput = {
      productId,
      startTime,
      endTime,
    };

    await createFlashSale(input);

    return response.status(201).json({
      message: "Flash sale created",
    });
  } catch (error) {
    next(error);
  }
};
