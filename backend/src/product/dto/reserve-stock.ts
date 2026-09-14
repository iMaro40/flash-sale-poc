export interface ReserveStockInput {
  productId: string;
  userId: string;
  idempotencyKey: string;
}

export interface ReleaseStockInput {
  productId: string;
  userId: string;
  idempotencyKey: string;
}

export enum StockReservationStatus {
  RESERVED = "RESERVED",
  IDEMPOTENT_SUCCESS = "IDEMPOTENT_SUCCESS",
  DUPLICATE_TRANSACTION = "DUPLICATE_TRANSACTION",
  TRANSACTION_IN_PROGRESS = "TRANSACTION_IN_PROGRESS",
  ALREADY_PURCHASED = "ALREADY_PURCHASED",
  OUT_OF_STOCK = "OUT_OF_STOCK",
  PRODUCT_CACHE_MISSING = "PRODUCT_CACHE_MISSING",
  FLASH_SALE_CACHE_MISSING = "FLASH_SALE_CACHE_MISSING",
  SALE_INACTIVE = "SALE_INACTIVE",
}

export interface StockReservationResult {
  status: StockReservationStatus;
  remainingStock?: number;
}
