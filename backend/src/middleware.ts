import { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
): void => {
  console.error(error);

  response.status(500).json({
    message: "Internal server error",
  });
};
