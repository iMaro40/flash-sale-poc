import type { Knex } from "knex";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveFlashSaleNotFoundError } from "../errors/active-flash-sale-not-found";
import { DuplicateTransactionError } from "../errors/duplicate-transaction";
import { OutOfStockError } from "../errors/out-of-stock";
import { ProductAlreadyPurchasedError } from "../errors/product-already-purchased";
import { ProductNotFoundError } from "../errors/product-not-found";
import { TransactionInProgressError } from "../errors/transaction-in-progress";
import type { FlashSale } from "../flash-sale/model";
import type { FlashSaleService } from "../flash-sale/service";
import type { Product } from "../product/model";
import type { ProductService } from "../product/service";
import { TransactionStatus, type Transaction } from "../transactions/model";
import type { TransactionService } from "../transactions/service";
import type { PurchaseProductInput } from "./dto/purchase-product";
import { PurchaseService } from "./service";

const {
  createPendingTransaction,
  updateTransactionStatusById,
  decrementStockByProductId,
} = vi.hoisted(() => ({
  createPendingTransaction: vi.fn(),
  updateTransactionStatusById: vi.fn(),
  decrementStockByProductId: vi.fn(),
}));

vi.mock("../transactions/repository", () => ({
  TransactionRepository: vi.fn().mockImplementation(() => ({
    createPendingTransaction,
    updateTransactionStatusById,
  })),
}));

vi.mock("../product/repository", () => ({
  ProductRepository: vi.fn().mockImplementation(() => ({
    decrementStockByProductId,
  })),
}));

const input: PurchaseProductInput = {
  productId: "product-1",
  userId: "user-1",
  idempotencyKey: "request-1",
};

const flashSale: FlashSale = {
  id: "flash-sale-1",
  productId: input.productId,
  startTime: new Date("2026-09-12T09:00:00.000Z"),
  endTime: new Date("2026-09-12T11:00:00.000Z"),
};

const product: Product = {
  id: input.productId,
  name: "Product 1",
  stock: 5,
};

const pendingTransaction: Transaction = {
  id: "transaction-1",
  idempotencyKey: input.idempotencyKey,
  productId: input.productId,
  userId: input.userId,
  status: TransactionStatus.PENDING,
  createdAt: new Date("2026-09-12T10:00:00.000Z"),
  updatedAt: new Date("2026-09-12T10:00:00.000Z"),
};

const createDb = (): { transaction: ReturnType<typeof vi.fn> } => ({
  transaction: vi.fn(
    async (
      callback: (trx: Knex.Transaction) => Promise<void>,
    ): Promise<void> => {
      await callback({} as Knex.Transaction);
    },
  ),
});

const createProductService = (): Record<string, ReturnType<typeof vi.fn>> => ({
  getProductById: vi.fn(),
  reserveStockByProductId: vi.fn(),
  releaseStockByProductId: vi.fn(),
});

const createFlashSaleService = (): Record<
  string,
  ReturnType<typeof vi.fn>
> => ({
  findActiveFlashSaleByProductId: vi.fn(),
});

const createTransactionService = (): Record<
  string,
  ReturnType<typeof vi.fn>
> => ({
  getTransactionByUserIdAndProductId: vi.fn(),
});

const createService = (): {
  service: PurchaseService;
  db: ReturnType<typeof createDb>;
  productService: ReturnType<typeof createProductService>;
  flashSaleService: ReturnType<typeof createFlashSaleService>;
  transactionService: ReturnType<typeof createTransactionService>;
} => {
  const db = createDb();
  const productService = createProductService();
  const flashSaleService = createFlashSaleService();
  const transactionService = createTransactionService();

  const service = new PurchaseService(
    db as unknown as Knex,
    productService as unknown as ProductService,
    flashSaleService as unknown as FlashSaleService,
    transactionService as unknown as TransactionService,
  );

  return { service, db, productService, flashSaleService, transactionService };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PurchaseService.purchaseProduct", () => {
  it("reserves stock, creates a pending transaction, and completes it on a valid purchase", async () => {
    const { service, productService, flashSaleService, transactionService } =
      createService();
    flashSaleService.findActiveFlashSaleByProductId.mockResolvedValue(
      flashSale,
    );
    productService.getProductById.mockResolvedValue(product);
    transactionService.getTransactionByUserIdAndProductId.mockResolvedValue(
      undefined,
    );
    productService.reserveStockByProductId.mockResolvedValue(4);
    createPendingTransaction.mockResolvedValue(pendingTransaction);
    decrementStockByProductId.mockResolvedValue(1);

    await service.purchaseProduct(input);

    expect(productService.reserveStockByProductId).toHaveBeenCalledWith(input);
    expect(createPendingTransaction).toHaveBeenCalledWith(input);
    expect(decrementStockByProductId).toHaveBeenCalledWith(input.productId);
    expect(updateTransactionStatusById).toHaveBeenCalledWith(
      pendingTransaction.id,
      TransactionStatus.COMPLETED,
    );
    expect(productService.releaseStockByProductId).not.toHaveBeenCalled();
  });

  it("throws when there is no active flash sale for the product", async () => {
    const { service, flashSaleService, productService } = createService();
    flashSaleService.findActiveFlashSaleByProductId.mockResolvedValue(
      undefined,
    );

    await expect(service.purchaseProduct(input)).rejects.toBeInstanceOf(
      ActiveFlashSaleNotFoundError,
    );
    expect(productService.reserveStockByProductId).not.toHaveBeenCalled();
  });

  it("throws when the product does not exist", async () => {
    const { service, flashSaleService, productService } = createService();
    flashSaleService.findActiveFlashSaleByProductId.mockResolvedValue(
      flashSale,
    );
    productService.getProductById.mockResolvedValue(undefined);

    await expect(service.purchaseProduct(input)).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
    expect(productService.reserveStockByProductId).not.toHaveBeenCalled();
  });

  it("throws when the product is out of stock in the database", async () => {
    const { service, flashSaleService, productService } = createService();
    flashSaleService.findActiveFlashSaleByProductId.mockResolvedValue(
      flashSale,
    );
    productService.getProductById.mockResolvedValue({ ...product, stock: 0 });

    await expect(service.purchaseProduct(input)).rejects.toBeInstanceOf(
      OutOfStockError,
    );
    expect(productService.reserveStockByProductId).not.toHaveBeenCalled();
  });

  it("resolves without purchasing again for an idempotent completed request", async () => {
    const { service, flashSaleService, productService, transactionService } =
      createService();
    flashSaleService.findActiveFlashSaleByProductId.mockResolvedValue(
      flashSale,
    );
    productService.getProductById.mockResolvedValue(product);
    transactionService.getTransactionByUserIdAndProductId.mockResolvedValue({
      ...pendingTransaction,
      status: TransactionStatus.COMPLETED,
    });

    await expect(service.purchaseProduct(input)).resolves.toBeUndefined();
    expect(productService.reserveStockByProductId).not.toHaveBeenCalled();
  });

  it("throws when the product was already purchased under a different idempotency key", async () => {
    const { service, flashSaleService, productService, transactionService } =
      createService();
    flashSaleService.findActiveFlashSaleByProductId.mockResolvedValue(
      flashSale,
    );
    productService.getProductById.mockResolvedValue(product);
    transactionService.getTransactionByUserIdAndProductId.mockResolvedValue({
      ...pendingTransaction,
      idempotencyKey: "another-request",
      status: TransactionStatus.COMPLETED,
    });

    await expect(service.purchaseProduct(input)).rejects.toBeInstanceOf(
      ProductAlreadyPurchasedError,
    );
  });

  it("throws a duplicate transaction error for a repeated in-flight idempotency key", async () => {
    const { service, flashSaleService, productService, transactionService } =
      createService();
    flashSaleService.findActiveFlashSaleByProductId.mockResolvedValue(
      flashSale,
    );
    productService.getProductById.mockResolvedValue(product);
    transactionService.getTransactionByUserIdAndProductId.mockResolvedValue(
      pendingTransaction,
    );

    await expect(service.purchaseProduct(input)).rejects.toBeInstanceOf(
      DuplicateTransactionError,
    );
  });

  it("throws a transaction-in-progress error for a different in-flight request", async () => {
    const { service, flashSaleService, productService, transactionService } =
      createService();
    flashSaleService.findActiveFlashSaleByProductId.mockResolvedValue(
      flashSale,
    );
    productService.getProductById.mockResolvedValue(product);
    transactionService.getTransactionByUserIdAndProductId.mockResolvedValue({
      ...pendingTransaction,
      idempotencyKey: "another-request",
    });

    await expect(service.purchaseProduct(input)).rejects.toBeInstanceOf(
      TransactionInProgressError,
    );
  });

  it("throws when the Redis reservation reports the product is out of stock", async () => {
    const { service, flashSaleService, productService, transactionService } =
      createService();
    flashSaleService.findActiveFlashSaleByProductId.mockResolvedValue(
      flashSale,
    );
    productService.getProductById.mockResolvedValue(product);
    transactionService.getTransactionByUserIdAndProductId.mockResolvedValue(
      undefined,
    );
    productService.reserveStockByProductId.mockResolvedValue(-2);

    await expect(service.purchaseProduct(input)).rejects.toBeInstanceOf(
      OutOfStockError,
    );
    expect(productService.releaseStockByProductId).not.toHaveBeenCalled();
  });

  it("releases the Redis reservation and rethrows when the DB stock is already exhausted", async () => {
    const { service, flashSaleService, productService, transactionService } =
      createService();
    flashSaleService.findActiveFlashSaleByProductId.mockResolvedValue(
      flashSale,
    );
    productService.getProductById.mockResolvedValue(product);
    transactionService.getTransactionByUserIdAndProductId.mockResolvedValue(
      undefined,
    );
    productService.reserveStockByProductId.mockResolvedValue(4);
    createPendingTransaction.mockResolvedValue(pendingTransaction);
    decrementStockByProductId.mockResolvedValue(0);

    await expect(service.purchaseProduct(input)).rejects.toBeInstanceOf(
      OutOfStockError,
    );
    expect(productService.releaseStockByProductId).toHaveBeenCalledWith(input);
    expect(updateTransactionStatusById).not.toHaveBeenCalled();
  });

  it("releases the Redis reservation and rethrows on an unexpected DB error", async () => {
    const { service, flashSaleService, productService, transactionService } =
      createService();
    flashSaleService.findActiveFlashSaleByProductId.mockResolvedValue(
      flashSale,
    );
    productService.getProductById.mockResolvedValue(product);
    transactionService.getTransactionByUserIdAndProductId.mockResolvedValue(
      undefined,
    );
    productService.reserveStockByProductId.mockResolvedValue(4);
    const dbError = new Error("connection lost");
    createPendingTransaction.mockRejectedValue(dbError);

    await expect(service.purchaseProduct(input)).rejects.toThrow(dbError);
    expect(productService.releaseStockByProductId).toHaveBeenCalledWith(input);
  });
});
