import { z } from "zod";

export const purchaseProductRequestSchema = z.object({
  productId: z.uuid(),
  userId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1),
});
