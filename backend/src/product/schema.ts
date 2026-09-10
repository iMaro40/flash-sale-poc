import { z } from "zod";

export const getProductRequestSchema = z.object({
  productId: z.uuid(),
});
