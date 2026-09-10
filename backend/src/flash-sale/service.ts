import { database } from "../database";
import type { CreateFlashSaleInput } from "./dto/create-flash-sale";
import { FlashSaleRepository } from "./repository";

// Fine to declare this in this file since only this service should access this repository anyway
const flashSaleRepository: FlashSaleRepository = new FlashSaleRepository(
  database,
);

export const getHelloMessage = (): string => {
  return "Hello, World!";
};

export const createFlashSale = async (
  input: CreateFlashSaleInput,
): Promise<void> => {
  const activeFlashSale =
    await flashSaleRepository.findActiveFlashSaleByProductId(input.productId);

  if (activeFlashSale !== undefined) {
    throw new Error("An active flash sale already exists for this product");
  }

  await flashSaleRepository.createFlashSale(input);
};
