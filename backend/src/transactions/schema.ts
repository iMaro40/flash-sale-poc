import { z } from "zod";

export const getTransactionRequestSchema = z.object({
  userId: z.uuid(),
  productId: z.uuid(),
});
