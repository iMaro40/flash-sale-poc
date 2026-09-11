import { Router } from "express";

import { validateRequestData } from "../middleware/validate-request-data";
import { getTransactionHandler } from "./controller";
import { getTransactionRequestSchema } from "./schema";

export const transactionRouter: Router = Router();

transactionRouter.get(
  "/transactions/:userId/:productId",
  validateRequestData(getTransactionRequestSchema, "params"),
  getTransactionHandler,
);
