import { Router } from "express";

import { validateRequestData } from "../middleware/validate-request-data";
import { createFlashSaleHandler, getFlashSaleHandler } from "./controller";
import {
  createFlashSaleRequestSchema,
  getFlashSaleRequestSchema,
} from "./schema";

export const flashSaleRouter: Router = Router();

flashSaleRouter.post(
  "/flash-sales",
  validateRequestData(createFlashSaleRequestSchema),
  createFlashSaleHandler,
);

flashSaleRouter.get(
  "/flash-sales/:flashSaleId",
  validateRequestData(getFlashSaleRequestSchema, "params"),
  getFlashSaleHandler,
);
