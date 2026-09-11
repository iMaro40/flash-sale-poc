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
      status: statusCode,
      message: error.message,
    });
    return;
  }

  response.status(500).json({
    status: 500,
    message: "Internal server error",
  });
};
