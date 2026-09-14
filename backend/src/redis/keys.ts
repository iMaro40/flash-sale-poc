export const redisKeys = {
  productDetails: (productId: string): string => `product:${productId}`,

  productStock: (productId: string): string => `product:{${productId}}:stock`,

  flashSale: (productId: string): string => `flash-sale:{${productId}}`,

  productBuyer: (productId: string, userId: string): string =>
    `product:{${productId}}:buyer:${userId}`,

  productReservation: (
    productId: string,
    userId: string,
    idempotencyKey: string,
  ): string => `product:{${productId}}:reservation:${userId}:${idempotencyKey}`,
};
