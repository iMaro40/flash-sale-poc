import { database } from "../database";
import type { CreatePendingTransactionInput } from "./dto/create-pending-transaction";
import type { Transaction } from "./model";
import { TransactionRepository } from "./repository";

export class TransactionService {
  public constructor(
    private readonly transactionRepository: TransactionRepository,
  ) {}

  public async getTransactionByIdempotencyKeyAndUserId(
    idempotencyKey: string,
    userId: string,
  ): Promise<Transaction | undefined> {
    return this.transactionRepository.getTransactionByIdempotencyKeyAndUserId(
      idempotencyKey,
      userId,
    );
  }

  public async createPendingTransaction(
    input: CreatePendingTransactionInput,
  ): Promise<void> {
    await this.transactionRepository.createPendingTransaction(input);
  }
}

export const transactionService: TransactionService = new TransactionService(
  new TransactionRepository(database),
);
