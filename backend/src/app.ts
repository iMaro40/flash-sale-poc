import cors from "cors";
import express, { type Express } from "express";

import { errorHandler } from "./middleware/error-handler";
import { rateLimiter } from "./middleware/rate-limiter";
import { flashSaleRouter } from "./flash-sale/router";
import { productRouter } from "./product/router";
import { purchaseRouter } from "./purchase/router";
import { transactionRouter } from "./transactions/router";

export const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(rateLimiter({ maxRequests: 5, windowSeconds: 1 }));

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

app.use(flashSaleRouter);
app.use(productRouter);
app.use(purchaseRouter);
app.use(transactionRouter);
app.use(errorHandler);
