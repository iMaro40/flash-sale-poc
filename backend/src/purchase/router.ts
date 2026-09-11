import { Router } from "express";

import { validateRequestData } from "../middleware/validate-request-data";
import { purchaseProductHandler } from "./controller";
import { purchaseProductRequestSchema } from "./schema";

export const purchaseRouter: Router = Router();

purchaseRouter.post(
  "/purchases",
  validateRequestData(purchaseProductRequestSchema),
  purchaseProductHandler,
);
