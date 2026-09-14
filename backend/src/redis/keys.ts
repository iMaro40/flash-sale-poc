export const redisKeys = {
  productDetails: (productId: string): string => `product:${productId}`,

  productStock: (productId: string): string => `product:{${productId}}:stock`,

  flashSaleDetails: (productId: string): string => `flash-sale:${productId}`,

  flashSaleWindow: (productId: string): string =>
    `flash-sale:{${productId}}:window`,

  productBuyer: (productId: string, userId: string): string =>
    `product:{${productId}}:buyer:${userId}`,

  productReservation: (
    productId: string,
    userId: string,
    idempotencyKey: string,
  ): string => `product:{${productId}}:reservation:${userId}:${idempotencyKey}`,
};
