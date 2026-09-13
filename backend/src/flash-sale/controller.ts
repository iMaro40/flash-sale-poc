import type { NextFunction, Request, Response } from "express";

import { FlashSaleNotFoundError } from "../errors/flash-sale-not-found";
import type { CreateFlashSaleInput } from "./dto/create-flash-sale";
import { flashSaleService } from "./service";

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

    const flashSaleId = await flashSaleService.createFlashSale(input);

    return response.status(201).json({
      message: "Flash sale created",
      flashSaleId,
    });
  } catch (error) {
    next(error);
  }
};

export const getFlashSalesByProductIdHandler = async (
  _: Request,
  response: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const { productId } = response.locals.requestData as {
      productId: string;
    };
    const flashSales =
      await flashSaleService.getFlashSalesByProductId(productId);

    return response.status(200).json(flashSales);
  } catch (error) {
    next(error);
  }
};

export const getFlashSaleByIdHandler = async (
  _: Request,
  response: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const { flashSaleId } = response.locals.requestData as {
      flashSaleId: string;
    };
    const flashSale = await flashSaleService.getFlashSaleById(flashSaleId);

    if (!flashSale) {
      throw new FlashSaleNotFoundError(flashSaleId);
    }

    return response.status(200).json(flashSale);
  } catch (error) {
    next(error);
  }
};
