import type { NextFunction, Request, Response } from "express";

import type { CreateProductInput } from "./dto/create-product";
import { createProduct, getProductById } from "./service";

export const createProductHandler = async (
  _: Request,
  response: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const input = response.locals.requestData as CreateProductInput;
    const product = await createProduct(input);

    return response.status(201).json(product);
  } catch (error) {
    next(error);
  }
};

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
