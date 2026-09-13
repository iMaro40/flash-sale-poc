import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app";
import { database } from "../../src/database";
import { closeRedis, connectRedis } from "../../src/redis";

interface ProductResponse {
  id: string;
}

describe("flash sale routes", () => {
  const createdProductIds: string[] = [];
  const createdFlashSaleIds: string[] = [];

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    if (createdFlashSaleIds.length > 0) {
      await database("flash_sales").whereIn("id", createdFlashSaleIds).delete();
    }

    if (createdProductIds.length > 0) {
      await database("products").whereIn("id", createdProductIds).delete();
    }

    await database.destroy();
    await closeRedis();
  });

  it("creates and retrieves a flash sale", async () => {
    const productResponse = await request(app)
      .post("/products")
      .send({ name: `Flash Sale Product ${Date.now()}`, stock: 2 })
      .expect(201);
    const product = productResponse.body as ProductResponse;
    createdProductIds.push(product.id);

    const startTime = new Date(Date.now() - 60_000);
    const endTime = new Date(Date.now() + 60 * 60_000);
    const createResponse = await request(app)
      .post("/flash-sales")
      .send({
        productId: product.id,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      })
      .expect(201);

    const { flashSaleId } = createResponse.body as { flashSaleId: string };
    createdFlashSaleIds.push(flashSaleId);

    expect(createResponse.body).toEqual({
      message: "Flash sale created",
      flashSaleId,
    });

    const listResponse = await request(app)
      .get(`/products/${product.id}/flash-sales`)
      .expect(200);

    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: flashSaleId,
        productId: product.id,
        status: "ACTIVE",
      }),
    ]);

    const getResponse = await request(app)
      .get(`/flash-sales/${flashSaleId}`)
      .expect(200);

    expect(getResponse.body).toEqual(
      expect.objectContaining({
        id: flashSaleId,
        productId: product.id,
        status: "ACTIVE",
      }),
    );
  });

  it("returns 404 when getting flash sales for an unknown product", async () => {
    const unknownId = "00000000-0000-0000-0000-000000000000";

    await request(app).get(`/products/${unknownId}/flash-sales`).expect(404);
  });

  it("returns 404 for an unknown flash sale id", async () => {
    const unknownId = "00000000-0000-0000-0000-000000000000";

    await request(app).get(`/flash-sales/${unknownId}`).expect(404);
  });

  it("rejects creating a flash sale for an unknown product", async () => {
    const unknownId = "00000000-0000-0000-0000-000000000000";
    const startTime = new Date(Date.now() - 60_000).toISOString();
    const endTime = new Date(Date.now() + 60 * 60_000).toISOString();

    await request(app)
      .post("/flash-sales")
      .send({ productId: unknownId, startTime, endTime })
      .expect(404);
  });
});
