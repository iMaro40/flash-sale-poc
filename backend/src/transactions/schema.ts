import { z } from "zod";

export const getTransactionRequestSchema = z.object({
  userId: z.string(),
  productId: z.string(),
});
