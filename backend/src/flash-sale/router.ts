import { Router } from "express";

import { validateRequestData } from "../middleware/validate-request-data";
import {
  createFlashSaleHandler,
  getFlashSaleByIdHandler,
  getFlashSalesByProductIdHandler,
} from "./controller";
import {
  createFlashSaleRequestSchema,
  getFlashSaleByIdRequestSchema,
  getFlashSalesByProductIdRequestSchema,
} from "./schema";

export const flashSaleRouter: Router = Router();

flashSaleRouter.post(
  "/flash-sales",
  validateRequestData(createFlashSaleRequestSchema),
  createFlashSaleHandler,
);

flashSaleRouter.get(
  "/flash-sales/:flashSaleId",
  validateRequestData(getFlashSaleByIdRequestSchema, "params"),
  getFlashSaleByIdHandler,
);

flashSaleRouter.get(
  "/products/:productId/flash-sales",
  validateRequestData(getFlashSalesByProductIdRequestSchema, "params"),
  getFlashSalesByProductIdHandler,
);
