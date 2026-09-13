import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app";
import { database } from "../../src/database";
import { closeRedis, connectRedis } from "../../src/redis";

interface ProductResponse {
  id: string;
  name: string;
  stock: number;
}

describe("public routes", () => {
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await database<ProductResponse>("products")
        .whereIn("id", createdProductIds)
        .delete();
    }

    await database.destroy();
    await closeRedis();
  });

  it("creates and retrieves a product", async () => {
    const firstProductInput = {
      name: `Integration Product One ${Date.now()}`,
      stock: 10,
    };

    const firstCreateResponse = await request(app)
      .post("/products")
      .send(firstProductInput)
      .expect(201);

    const firstProduct = firstCreateResponse.body as ProductResponse;
    createdProductIds.push(firstProduct.id);

    const getResponse = await request(app)
      .get(`/products/${firstProduct.id}`)
      .expect(200);

    expect(firstProduct).toMatchObject({
      name: firstProductInput.name,
      stock: firstProductInput.stock,
    });
    expect(getResponse.body).toEqual(firstProduct);
  });

  it("rejects invalid product input and returns not found for an unknown product", async () => {
    await request(app)
      .post("/products")
      .send({ name: "", stock: -1 })
      .expect(400);

    const response = await request(app)
      .get("/products/00000000-0000-0000-0000-000000000000")
      .expect(404);

    expect(response.body.message).toContain("was not found");
  });
});
