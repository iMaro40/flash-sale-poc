import { database } from "../database";
import { FlashSaleOverlapError } from "../errors/flash-sale-overlap";
import type { CreateFlashSaleInput } from "./dto/create-flash-sale";
import { FlashSaleRepository } from "./repository";

// Fine to declare this in this file since only this service should access this repository anyway
const flashSaleRepository: FlashSaleRepository = new FlashSaleRepository(
  database,
);

export const getHelloMessage = (): string => {
  return "Hello, World!";
};

const validateCreateFlashSale = async (input: CreateFlashSaleInput) => {
  const overlappingFlashSale =
    await flashSaleRepository.findOverlappingFlashSaleByProductId(input);

  if (overlappingFlashSale !== undefined) {
    throw new FlashSaleOverlapError(input.productId);
  }
};

export const createFlashSale = async (
  input: CreateFlashSaleInput,
): Promise<void> => {
  await validateCreateFlashSale(input);

  await flashSaleRepository.createFlashSale(input);
};
