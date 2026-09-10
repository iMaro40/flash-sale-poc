import { Router } from "express";

import { getHelloWorld } from "./controller";

export const flashSaleRouter: Router = Router();

flashSaleRouter.get("/", getHelloWorld);
