import { z } from "zod";

export const createFlashSaleRequestSchema = z
  .object({
    productId: z.string().trim().uuid(),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
  })
  .refine((value): boolean => value.endTime > value.startTime, {
    message: "endTime must be greater than startTime",
    path: ["endTime"],
  })
  .refine((value): boolean => value.endTime > new Date(), {
    message: "endTime must be in the future",
    path: ["endTime"],
  });

export const getFlashSalesByProductIdRequestSchema = z.object({
  productId: z.string().trim().uuid(),
});

export const getFlashSaleByIdRequestSchema = z.object({
  flashSaleId: z.string().trim().uuid(),
});
