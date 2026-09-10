import "dotenv/config";

import cors from "cors";
import express, { Express } from "express";

import { flashSaleRouter } from "./flash-sale/router";

const app: Express = express();
const port: number = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());
app.use(flashSaleRouter);

app.listen(port, (): void => {
  console.log(`Backend server listening on port ${port}`);
});
