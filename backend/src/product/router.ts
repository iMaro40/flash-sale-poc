import { Router } from "express";

import { validateRequestData } from "../middleware/validate-request-data";
import { getProductHandler } from "./controller";
import { getProductRequestSchema } from "./schema";

export const productRouter: Router = Router();

productRouter.get(
  "/products/:productId",
  validateRequestData(getProductRequestSchema, "params"),
  getProductHandler,
);
