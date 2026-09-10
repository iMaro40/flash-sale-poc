import type { RequestHandler } from "express";
import { z } from "zod";

type RequestDataSource = "body" | "params";

export const validateRequestData = (
  schema: z.ZodType,
  source: RequestDataSource = "body",
): RequestHandler => {
  return (request, response, next): void => {
    const requestData = source === "body" ? request.body : request.params;
    const parsedRequest = schema.safeParse(requestData);

    if (!parsedRequest.success) {
      const validationErrors: string[] = parsedRequest.error.issues.map(
        (issue): string => `${issue.path.join(".")}: ${issue.message}`,
      );

      response.status(400).json({
        message: "Invalid request data",
        errors: validationErrors,
      });
      return;
    }

    response.locals.requestData = parsedRequest.data;
    next();
  };
};
