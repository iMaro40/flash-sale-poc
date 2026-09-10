import type { NextFunction, Request, Response } from "express";

import type { CreateFlashSaleInput } from "./dto/create-flash-sale";
import { createFlashSaleRequestSchema } from "./schema";
import { createFlashSale, getHelloMessage } from "./service";

export const getHelloWorld = (
  _request: Request,
  response: Response,
): Response => {
  const message: string = getHelloMessage();

  return response.status(200).send(message);
};

export const createFlashSaleHandler = async (
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const parsedRequest = createFlashSaleRequestSchema.safeParse(request.body);

    if (!parsedRequest.success) {
      const validationErrors: string[] = parsedRequest.error.issues.map(
        (issue): string => `${issue.path.join(".")}: ${issue.message}`,
      );

      return response.status(400).json({
        message: "Invalid request data",
        errors: validationErrors,
      });
    }

    const { productId, startTime, endTime } = parsedRequest.data;

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
