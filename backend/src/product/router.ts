import { Router } from "express";

import { validateRequestData } from "../middleware/validate-request-data";
import { createProductHandler, getProductHandler } from "./controller";
import { createProductRequestSchema, getProductRequestSchema } from "./schema";

export const productRouter: Router = Router();

productRouter.post(
  "/products",
  validateRequestData(createProductRequestSchema),
  createProductHandler,
);

productRouter.get(
  "/products/:productId",
  validateRequestData(getProductRequestSchema, "params"),
  getProductHandler,
);
