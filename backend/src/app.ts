import cors from "cors";
import express, { type Express } from "express";

import { getDbPoolStats } from "./database";
import { errorHandler } from "./middleware/error-handler";
import { rateLimiter } from "./middleware/rate-limiter";
import { flashSaleRouter } from "./flash-sale/router";
import { productRouter } from "./product/router";
import { purchaseRouter } from "./purchase/router";
import { transactionRouter } from "./transactions/router";

export const app: Express = express();

app.use(cors());
app.use(express.json());
// Arbitrarily high rate limit so that it doesn't interfere with stress tests. For production use case definitely set this to an arbitrary number
// Also for production use case, might need some set up where we mock different IP's for each virtual user
app.use(rateLimiter({ maxRequests: 500000, windowSeconds: 1 }));

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

// Used by stress-tests/monitor.sh to distinguish "waiting for a pool connection" from
// "waiting on a Postgres row lock after already holding a connection".
app.get("/internal/db-pool-stats", (_request, response) => {
  response.status(200).json(getDbPoolStats());
});

app.use(flashSaleRouter);
app.use(productRouter);
app.use(purchaseRouter);
app.use(transactionRouter);
app.use(errorHandler);
