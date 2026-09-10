import type { NextFunction, Request, Response } from "express";

import { getProductById } from "./service";

export const getProductHandler = async (
  _: Request,
  response: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const { productId } = response.locals.requestData as {
      productId: string;
    };
    const product = await getProductById(productId);

    return response.status(200).json(product);
  } catch (error) {
    next(error);
  }
};
