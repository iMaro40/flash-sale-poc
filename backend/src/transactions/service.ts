import { database } from "../database";
import { InvalidTransactionStatusError } from "../errors/invalid-transaction-status";
import type { CreatePendingTransactionInput } from "./dto/create-pending-transaction";
import { TransactionStatus, type Transaction } from "./model";
import { TransactionRepository } from "./repository";

export class TransactionService {
  public constructor(
    private readonly transactionRepository: TransactionRepository,
  ) {}

  public async getTransactions(): Promise<Transaction[]> {
    return this.transactionRepository.findAll();
  }

  public async getPendingTransactionsCreatedBefore(
    cutoff: Date,
  ): Promise<Transaction[]> {
    return this.transactionRepository.findPendingTransactionsCreatedBefore(
      cutoff,
    );
  }

  public async getTransactionByIdempotencyKeyAndUserId(
    idempotencyKey: string,
    userId: string,
  ): Promise<Transaction | undefined> {
    return this.transactionRepository.getTransactionByIdempotencyKeyAndUserId(
      idempotencyKey,
      userId,
    );
  }

  public async getTransactionByUserIdAndProductId(
    userId: string,
    productId: string,
  ): Promise<Transaction | undefined> {
    return this.transactionRepository.getTransactionByUserIdAndProductId(
      userId,
      productId,
    );
  }

  public async createPendingTransaction(
    input: CreatePendingTransactionInput,
  ): Promise<Transaction> {
    return this.transactionRepository.createPendingTransaction(input);
  }

  public async updateTransactionStatusById(
    id: string,
    status: string,
  ): Promise<void> {
    if (
      !Object.values(TransactionStatus).includes(status as TransactionStatus)
    ) {
      throw new InvalidTransactionStatusError(status);
    }

    await this.transactionRepository.updateTransactionStatusById(
      id,
      status as TransactionStatus,
    );
  }
}

export const transactionService: TransactionService = new TransactionService(
  new TransactionRepository(database),
);
