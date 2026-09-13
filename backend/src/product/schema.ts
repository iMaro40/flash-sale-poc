import { z } from "zod";

export const createProductRequestSchema = z.object({
  name: z.string().trim().min(1),
  stock: z.number().int().nonnegative(),
});

export const getProductRequestSchema = z.object({
  productId: z.string(),
});
