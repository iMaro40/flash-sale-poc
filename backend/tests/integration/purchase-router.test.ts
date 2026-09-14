import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app";
import { database } from "../../src/database";
import type { PurchaseProductInput } from "../../src/purchase/dto/purchase-product";
import { purchaseService } from "../../src/purchase/service";
import {
  closeRabbitMQ,
  connectRabbitMQ,
  createConsumerChannel,
} from "../../src/rabbitmq";
import { assertPurchaseQueue, PURCHASE_QUEUE } from "../../src/rabbitmq/queues";
import { closeRedis, connectRedis } from "../../src/redis";

interface ProductResponse {
  id: string;
}

// Simulates the purchase worker for a single message: the DB write is normally
// performed asynchronously by a separate consumer process, not the HTTP request.
const processNextPurchaseMessage = async (): Promise<void> => {
  const channel = await createConsumerChannel();
  await assertPurchaseQueue(channel);
  const message = await channel.get(PURCHASE_QUEUE, { noAck: false });

  if (!message) {
    throw new Error("Expected a queued purchase message to process");
  }

  const input = JSON.parse(message.content.toString()) as PurchaseProductInput;

  await purchaseService.completePurchase(input);
  channel.ack(message);
  await channel.close();
};

describe("purchase routes", () => {
  const createdProductIds: string[] = [];
  const createdFlashSaleIds: string[] = [];
  const createdTransactionIds: string[] = [];

  beforeAll(async () => {
    await connectRedis();
    await connectRabbitMQ();
  });

  afterAll(async () => {
    await closeRabbitMQ();
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
      .expect(202);

    expect(response.body).toEqual({ message: "Purchase accepted, processing" });
    await processNextPurchaseMessage();

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

  it("rejects a purchase for an unknown product", async () => {
    const response = await request(app)
      .post("/purchases")
      .send({
        productId: "00000000-0000-0000-0000-000000000000",
        userId: "44444444-4444-4444-4444-444444444444",
        idempotencyKey: `integration-missing-product-${Date.now()}`,
      })
      .expect(404);

    expect(response.body.message).toContain("was not found");
  });

  it("rejects a purchase when the product is out of stock", async () => {
    const productResponse = await request(app)
      .post("/products")
      .send({ name: `Out of Stock Product ${Date.now()}`, stock: 0 })
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

    const response = await request(app)
      .post("/purchases")
      .send({
        productId: product.id,
        userId: "55555555-5555-5555-5555-555555555555",
        idempotencyKey: `integration-out-of-stock-${Date.now()}`,
      })
      .expect(409);

    expect(response.body.message).toContain("out of stock");
  });

  it("rejects a second purchase of the same product by the same user", async () => {
    const productResponse = await request(app)
      .post("/products")
      .send({ name: `Already Purchased Product ${Date.now()}`, stock: 2 })
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

    const userId = "66666666-6666-6666-6666-666666666666";
    await request(app)
      .post("/purchases")
      .send({
        productId: product.id,
        userId,
        idempotencyKey: `integration-first-purchase-${Date.now()}`,
      })
      .expect(202);
    await processNextPurchaseMessage();

    const response = await request(app)
      .post("/purchases")
      .send({
        productId: product.id,
        userId,
        idempotencyKey: `integration-second-purchase-${Date.now()}`,
      })
      .expect(409);

    expect(response.body.message).toContain("already purchased");

    const transaction = await database("transactions")
      .where({ user_id: userId, product_id: product.id })
      .first("id");
    if (transaction) {
      createdTransactionIds.push(transaction.id);
    }
  });

  it("rejects invalid purchase input", async () => {
    const response = await request(app)
      .post("/purchases")
      .send({ productId: "", userId: "user", idempotencyKey: "key" })
      .expect(400);

    expect(response.body.message).toBe("Invalid request data");
    expect(response.body.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("productId")]),
    );
  });

  it("purchases succeed when a later, non-overlapping flash sale is scheduled for the same product", async () => {
    const productResponse = await request(app)
      .post("/products")
      .send({ name: `Upcoming Sale Overwrite Product ${Date.now()}`, stock: 1 })
      .expect(201);
    const product = productResponse.body as ProductResponse;
    createdProductIds.push(product.id);

    const activeStart = new Date(Date.now() - 60_000);
    const activeEnd = new Date(Date.now() + 60_000);
    const activeFlashSaleResponse = await request(app)
      .post("/flash-sales")
      .send({
        productId: product.id,
        startTime: activeStart.toISOString(),
        endTime: activeEnd.toISOString(),
      })
      .expect(201);
    createdFlashSaleIds.push(activeFlashSaleResponse.body.flashSaleId);

    // Non-overlapping and starts later, but creating it must not clobber the active sale's cached window.
    const upcomingStart = new Date(activeEnd.getTime() + 60_000);
    const upcomingEnd = new Date(upcomingStart.getTime() + 60_000);
    const upcomingFlashSaleResponse = await request(app)
      .post("/flash-sales")
      .send({
        productId: product.id,
        startTime: upcomingStart.toISOString(),
        endTime: upcomingEnd.toISOString(),
      })
      .expect(201);
    createdFlashSaleIds.push(upcomingFlashSaleResponse.body.flashSaleId);

    const userId = "88888888-8888-8888-8888-888888888888";
    const response = await request(app)
      .post("/purchases")
      .send({
        productId: product.id,
        userId,
        idempotencyKey: `integration-upcoming-overwrite-${Date.now()}`,
      })
      .expect(202);

    expect(response.body).toEqual({ message: "Purchase accepted, processing" });
    await processNextPurchaseMessage();

    const transaction = await database("transactions")
      .where({ user_id: userId, product_id: product.id })
      .first("id");
    if (transaction) {
      createdTransactionIds.push(transaction.id);
    }
  });
});
