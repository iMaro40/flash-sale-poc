// IMPORTANT: Assumes that product IDs, user IDs, and idempotency keys do not contain colons (":") to avoid key collisions.
// ALSO IMPORTANT: Assumes one Redis instance. Need to change naming conventions for multiple instances accordingly.

export const redisKeys = {
  productDetails: (productId: string): string => `product:${productId}:details`,

  productStock: (productId: string): string => `product:${productId}:stock`,

  flashSale: (productId: string): string => `flash-sale:${productId}`,

  productBuyer: (productId: string, userId: string): string =>
    `product:${productId}:buyer:${userId}`,

  productReservation: (
    productId: string,
    userId: string,
    idempotencyKey: string,
  ): string => `product:${productId}:reservation:${userId}:${idempotencyKey}`,
};
