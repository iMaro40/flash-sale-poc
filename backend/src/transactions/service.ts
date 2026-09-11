import { database } from "../database";
import type { CreatePendingTransactionInput } from "./dto/create-pending-transaction";
import { TransactionRepository } from "./repository";

export class TransactionService {
  public constructor(
    private readonly transactionRepository: TransactionRepository,
  ) {}

  public async createPendingTransaction(
    input: CreatePendingTransactionInput,
  ): Promise<void> {
    await this.transactionRepository.createPendingTransaction(input);
  }
}

export const transactionService: TransactionService = new TransactionService(
  new TransactionRepository(database),
);
