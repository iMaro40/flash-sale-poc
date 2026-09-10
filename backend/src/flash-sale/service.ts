import { CreateFlashSaleInput } from "./model";
import { FlashSaleRepository } from "./repository";

const flashSaleRepository: FlashSaleRepository = new FlashSaleRepository();

export const getHelloMessage = (): string => {
  return "Hello, World!";
};

export const createFlashSale = async (
  input: CreateFlashSaleInput,
): Promise<void> => {
  await flashSaleRepository.createFlashSale(input);
};
