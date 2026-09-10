import { z } from "zod";

export const createFlashSaleRequestSchema = z
  .object({
    productId: z.string().trim().min(1),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    userId: z.string().trim().min(1),
  })
  .refine((value): boolean => value.endTime > value.startTime, {
    message: "endTime must be greater than startTime",
    path: ["endTime"],
  });
