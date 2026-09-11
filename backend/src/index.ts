import { config } from "dotenv";
import { resolve } from "node:path";

import cors from "cors";
import express, { type Express } from "express";

import { flashSaleRouter } from "./flash-sale/router";
import { errorHandler } from "./middleware/error-handler";
import { purchaseRouter } from "./purchase/router";
import { productRouter } from "./product/router";
import { connectRedis } from "./redis";
import { transactionRouter } from "./transactions/router";

config({ path: resolve(__dirname, "../../.env") });

const app: Express = express();
const port: number = Number(process.env.PORT ?? 3000);

const startServer = async (): Promise<void> => {
  await connectRedis();

  app.use(cors());
  app.use(express.json());
  app.use(flashSaleRouter);
  app.use(productRouter);
  app.use(purchaseRouter);
  app.use(transactionRouter);
  app.use(errorHandler);

  app.listen(port, (): void => {
    console.log(`Backend server listening on port ${port}`);
  });
};

void startServer();
