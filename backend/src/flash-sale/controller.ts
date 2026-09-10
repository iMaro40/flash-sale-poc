import { Request, Response } from "express";

import { getHelloMessage } from "./service";

export const getHelloWorld = (_request: Request, response: Response): Response => {
  const message: string = getHelloMessage();

  return response.status(200).send(message);
};
