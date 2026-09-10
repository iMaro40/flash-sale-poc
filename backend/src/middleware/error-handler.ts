import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
): void => {
  console.error(error);

  if (error instanceof Error) {
    const statusCode = "statusCode" in error ? Number(error.statusCode) : 500;

    response.status(statusCode).json({
      message: error.message,
    });
    return;
  }

  response.status(500).json({
    message: "Internal server error",
  });
};
