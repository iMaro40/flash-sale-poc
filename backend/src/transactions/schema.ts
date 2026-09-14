import { z } from "zod";

export const getTransactionRequestSchema = z.object({
  userId: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^:]+$/, "must not contain ':'"),
  productId: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^:]+$/, "must not contain ':'"),
});
