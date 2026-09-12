import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app";
import { database } from "../../src/database";
import { closeRedis, connectRedis } from "../../src/redis";

interface ProductResponse {
  id: string;
}

describe("transaction routes", () => {
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await database("products").whereIn("id", createdProductIds).delete();
    }

    await database.destroy();
    await closeRedis();
  });

  it("reports when a user has not purchased a product", async () => {
    const productResponse = await request(app)
      .post("/products")
      .send({ name: `Unpurchased Product ${Date.now()}`, stock: 1 })
      .expect(201);
    const product = productResponse.body as ProductResponse;
    createdProductIds.push(product.id);

    const response = await request(app)
      .get(`/transactions/22222222-2222-2222-2222-222222222222/${product.id}`)
      .expect(200);

    expect(response.body).toEqual({
      code: "NO_PURCHASE",
      message: "User has not purchased the product",
    });
  });

  it("returns not found for an unknown product", async () => {
    const response = await request(app)
      .get(
        "/transactions/22222222-2222-2222-2222-222222222222/00000000-0000-0000-0000-000000000000",
      )
      .expect(404);

    expect(response.body.message).toContain("Product not found");
  });
});
