import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app";
import { database } from "../../src/database";
import { closeRedis, connectRedis } from "../../src/redis";

interface ProductResponse {
  id: string;
}

describe("purchase routes", () => {
  const createdProductIds: string[] = [];
  const createdFlashSaleIds: string[] = [];
  const createdTransactionIds: string[] = [];

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    if (createdTransactionIds.length > 0) {
      await database("transactions")
        .whereIn("id", createdTransactionIds)
        .delete();
    }

    if (createdProductIds.length > 0) {
      await database("transactions")
        .whereIn("product_id", createdProductIds)
        .delete();
    }

    if (createdFlashSaleIds.length > 0) {
      await database("flash_sales").whereIn("id", createdFlashSaleIds).delete();
    }

    if (createdProductIds.length > 0) {
      await database("flash_sales")
        .whereIn("product_id", createdProductIds)
        .delete();
      await database("products").whereIn("id", createdProductIds).delete();
    }

    await database.destroy();
    await closeRedis();
  });

  it("purchases a product during an active flash sale", async () => {
    const productResponse = await request(app)
      .post("/products")
      .send({ name: `Purchase Product ${Date.now()}`, stock: 1 })
      .expect(201);
    const product = productResponse.body as ProductResponse;
    createdProductIds.push(product.id);

    const flashSaleResponse = await request(app)
      .post("/flash-sales")
      .send({
        productId: product.id,
        startTime: new Date(Date.now() - 60_000).toISOString(),
        endTime: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
      .expect(201);
    createdFlashSaleIds.push(flashSaleResponse.body.flashSaleId);

    const userId = "11111111-1111-1111-1111-111111111111";
    const response = await request(app)
      .post("/purchases")
      .send({
        productId: product.id,
        userId,
        idempotencyKey: `integration-${Date.now()}`,
      })
      .expect(201);

    expect(response.body).toEqual({ message: "Purchase created" });

    const transactionResponse = await request(app)
      .get(`/transactions/${userId}/${product.id}`)
      .expect(200);

    expect(transactionResponse.body).toEqual({
      code: "TRANSACTION_COMPLETE",
      message: "Product purchased",
    });

    const transaction = await database("transactions")
      .where({ user_id: userId, product_id: product.id })
      .first("id");
    if (transaction) {
      createdTransactionIds.push(transaction.id);
    }
  });

  it("rejects a purchase without an active flash sale", async () => {
    const productResponse = await request(app)
      .post("/products")
      .send({ name: `Inactive Sale Product ${Date.now()}`, stock: 1 })
      .expect(201);
    const product = productResponse.body as ProductResponse;
    createdProductIds.push(product.id);

    const response = await request(app)
      .post("/purchases")
      .send({
        productId: product.id,
        userId: "33333333-3333-3333-3333-333333333333",
        idempotencyKey: `integration-inactive-${Date.now()}`,
      })
      .expect(409);

    expect(response.body.message).toContain("active flash sale");
  });
});
