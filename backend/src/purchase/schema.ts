import { z } from "zod";

export const purchaseProductRequestSchema = z.object({
  productId: z.string(),
  userId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1),
});
