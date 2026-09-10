import { Router } from "express";

import { validateRequestData } from "../middleware/validate-request-data";
import { createFlashSaleHandler } from "./controller";
import { createFlashSaleRequestSchema } from "./schema";

export const flashSaleRouter: Router = Router();

flashSaleRouter.post(
  "/flash-sales",
  validateRequestData(createFlashSaleRequestSchema),
  createFlashSaleHandler,
);
