import { z } from "zod";

export const purchaseProductRequestSchema = z.object({
  productId: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^:]+$/, "must not contain ':'"),
  userId: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^:]+$/, "must not contain ':'"),
  idempotencyKey: z
    .string()
    .trim()
    .min(1)
    .regex(/^[^:]+$/, "must not contain ':'"),
});
