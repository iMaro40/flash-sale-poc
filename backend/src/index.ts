import "dotenv/config";

import cors from "cors";
import express, { Express } from "express";

import { connectDatabase } from "./database";
import { flashSaleRouter } from "./flash-sale/router";
import { errorHandler } from "./middleware/error-handler";

const app: Express = express();
const port: number = Number(process.env.PORT ?? 3000);

const startServer = async (): Promise<void> => {
  await connectDatabase();

  app.use(cors());
  app.use(express.json());
  app.use(flashSaleRouter);
  app.use(errorHandler);

  app.listen(port, (): void => {
    console.log(`Backend server listening on port ${port}`);
  });
};

void startServer();
