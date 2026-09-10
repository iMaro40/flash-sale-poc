import { z } from "zod";

export const createFlashSaleRequestSchema = z
  .object({
    productId: z.uuid(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
  })
  .refine((value): boolean => value.endTime > value.startTime, {
    message: "endTime must be greater than startTime",
    path: ["endTime"],
  });
