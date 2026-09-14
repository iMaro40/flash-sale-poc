import type { NextFunction, Request, Response } from "express";

import { ProductNotFoundError } from "../errors/product-not-found";
import { productService } from "../product/service";
import { TransactionStatus } from "./model";
import { transactionService } from "./service";

export const getTransactionsHandler = async (
  _: Request,
  response: Response,
  next: NextFunction,
): Promise<Response | void> => {
  try {
    const transactions = await transactionService.getTransactions();
    return response.status(200).json(transactions);
  } catch (error) {
    next(error);
  }
};

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

    const product = await productService.getProductById(productId);

    if (!product) {
      throw new ProductNotFoundError(productId);
    }

    const transaction =
      await transactionService.getTransactionByUserIdAndProductId(
        userId,
        productId,
      );

    if (!transaction) {
      return response.status(200).json({
        code: "NO_PURCHASE",
        message: "User has not purchased the product",
      });
    }

    if (transaction.status === TransactionStatus.PENDING) {
      return response.status(200).json({
        code: "TRANSACTION_PENDING",
        message: "Processing purchase",
      });
    }

    if (transaction.status === TransactionStatus.COMPLETED) {
      return response.status(200).json({
        code: "TRANSACTION_COMPLETE",
        message: "Product purchased",
      });
    }

    if (transaction.status === TransactionStatus.CANCELLED) {
      return response.status(200).json({
        code: "TRANSACTION_CANCELLED",
        message: "Purchase cancelled",
      });
    }

    return response.status(200).json({
      code: "TRANSACTION_PENDING",
      message: "Processing purchase",
    });
  } catch (error) {
    next(error);
  }
};
