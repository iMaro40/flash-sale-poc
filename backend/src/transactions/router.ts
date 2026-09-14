import { Router } from "express";

import { validateRequestData } from "../middleware/validate-request-data";
import { getTransactionHandler, getTransactionsHandler } from "./controller";
import { getTransactionRequestSchema } from "./schema";

export const transactionRouter: Router = Router();

// Simple endpoint for display purposes
transactionRouter.get("/transactions", getTransactionsHandler);

transactionRouter.get(
  "/transactions/:userId/:productId",
  validateRequestData(getTransactionRequestSchema, "params"),
  getTransactionHandler,
);
