import type { NextFunction, Request, Response } from "express";

import { TransactionStatus } from "./model";
import { transactionService } from "./service";

export const getTransactionHandler = async (
  _: Request,
  response: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const { userId, productId } = response.locals.requestData as {
      userId: string;
      productId: string;
    };
    const transaction =
      await transactionService.getTransactionByUserIdAndProductId(
        userId,
        productId,
      );

    if (!transaction) {
      return response.status(200).json({
        message: "User has not purchased the product",
      });
    }

    if (transaction.status === TransactionStatus.Pending) {
      return response.status(200).json({ message: "Processing purchase" });
    }

    if (transaction.status === TransactionStatus.Completed) {
      return response.status(200).json({ message: "Product purchased" });
    }

    return response.status(200).json({ message: "Purchase failed" });
  } catch (error) {
    next(error);
  }
};
