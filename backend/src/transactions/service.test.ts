import { describe, expect, it, vi } from "vitest";

import { InvalidTransactionStatusError } from "../errors/invalid-transaction-status";
import type { CreatePendingTransactionInput } from "./dto/create-pending-transaction";
import { TransactionStatus, type Transaction } from "./model";
import type { TransactionRepository } from "./repository";
import { TransactionService } from "./service";

const transaction: Transaction = {
  id: "transaction-1",
  idempotencyKey: "request-1",
  productId: "product-1",
  userId: "user-1",
  status: TransactionStatus.Pending,
  createdAt: new Date("2026-09-12T10:00:00.000Z"),
  updatedAt: new Date("2026-09-12T10:00:00.000Z"),
};

const createTransactionRepository = (): Record<
  string,
  ReturnType<typeof vi.fn>
> => ({
  getTransactionByIdempotencyKeyAndUserId: vi.fn(),
  getTransactionByUserIdAndProductId: vi.fn(),
  createPendingTransaction: vi.fn(),
  updateTransactionStatusById: vi.fn(),
});

const createService = (): {
  service: TransactionService;
  repository: ReturnType<typeof createTransactionRepository>;
} => {
  const repository = createTransactionRepository();
  const service = new TransactionService(
    repository as unknown as TransactionRepository,
  );

  return { service, repository };
};

describe("TransactionService lookups", () => {
  it("returns a transaction by idempotency key and user", async () => {
    const { service, repository } = createService();
    repository.getTransactionByIdempotencyKeyAndUserId.mockResolvedValue(
      transaction,
    );

    const result = await service.getTransactionByIdempotencyKeyAndUserId(
      transaction.idempotencyKey,
      transaction.userId,
    );

    expect(result).toEqual(transaction);
    expect(
      repository.getTransactionByIdempotencyKeyAndUserId,
    ).toHaveBeenCalledWith(transaction.idempotencyKey, transaction.userId);
  });

  it("returns undefined when no user/product transaction exists", async () => {
    const { service, repository } = createService();
    repository.getTransactionByUserIdAndProductId.mockResolvedValue(undefined);

    const result = await service.getTransactionByUserIdAndProductId(
      transaction.userId,
      transaction.productId,
    );

    expect(result).toBeUndefined();
    expect(repository.getTransactionByUserIdAndProductId).toHaveBeenCalledWith(
      transaction.userId,
      transaction.productId,
    );
  });
});

describe("TransactionService.createPendingTransaction", () => {
  it("creates and returns a pending transaction", async () => {
    const { service, repository } = createService();
    const input: CreatePendingTransactionInput = {
      idempotencyKey: transaction.idempotencyKey,
      productId: transaction.productId,
      userId: transaction.userId,
    };
    repository.createPendingTransaction.mockResolvedValue(transaction);

    const result = await service.createPendingTransaction(input);

    expect(result).toEqual(transaction);
    expect(repository.createPendingTransaction).toHaveBeenCalledWith(input);
  });
});

describe("TransactionService.updateTransactionStatusById", () => {
  it("updates a transaction with a valid status", async () => {
    const { service, repository } = createService();

    await service.updateTransactionStatusById(
      transaction.id,
      TransactionStatus.Completed,
    );

    expect(repository.updateTransactionStatusById).toHaveBeenCalledWith(
      transaction.id,
      TransactionStatus.Completed,
    );
  });

  it("throws for an invalid status and does not update the repository", async () => {
    const { service, repository } = createService();

    await expect(
      service.updateTransactionStatusById(transaction.id, "unknown"),
    ).rejects.toBeInstanceOf(InvalidTransactionStatusError);
    expect(repository.updateTransactionStatusById).not.toHaveBeenCalled();
  });
});
