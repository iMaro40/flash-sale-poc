import { Router } from "express";

import { createFlashSaleHandler, getHelloWorld } from "./controller";

export const flashSaleRouter: Router = Router();

flashSaleRouter.get("/", getHelloWorld);
flashSaleRouter.post("/flash-sales", createFlashSaleHandler);
