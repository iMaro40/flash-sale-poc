import { database } from "../database";
import { FlashSaleRepository } from "./repository";
import { CreateFlashSaleInput } from "./dto/create-flash-sale";

const flashSaleRepository: FlashSaleRepository = new FlashSaleRepository(
  database,
);

export const getHelloMessage = (): string => {
  return "Hello, World!";
};

export const createFlashSale = async (
  input: CreateFlashSaleInput,
): Promise<void> => {
  await flashSaleRepository.createFlashSale(input);
};
