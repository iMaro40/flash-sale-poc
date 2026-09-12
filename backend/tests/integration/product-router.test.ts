import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { app } from "../../src/app";
import { database } from "../../src/database";

interface ProductResponse {
  id: string;
  name: string;
  stock: number;
}

describe("product routes", () => {
  const createdProductIds: string[] = [];

  afterAll(async () => {
    if (createdProductIds.length > 0) {
      await database<ProductResponse>("products")
        .whereIn("id", createdProductIds)
        .delete();
    }

    await database.destroy();
  });

  it("creates two products and retrieves the first one", async () => {
    const firstProductInput = {
      name: `Integration Product One ${Date.now()}`,
      stock: 10,
    };
    const secondProductInput = {
      name: `Integration Product Two ${Date.now()}`,
      stock: 5,
    };

    const firstCreateResponse = await request(app)
      .post("/products")
      .send(firstProductInput)
      .expect(201);
    const secondCreateResponse = await request(app)
      .post("/products")
      .send(secondProductInput)
      .expect(201);

    const firstProduct = firstCreateResponse.body as ProductResponse;
    const secondProduct = secondCreateResponse.body as ProductResponse;
    createdProductIds.push(firstProduct.id, secondProduct.id);

    const getResponse = await request(app)
      .get(`/products/${firstProduct.id}`)
      .expect(200);

    expect(firstProduct).toMatchObject({
      name: firstProductInput.name,
      stock: firstProductInput.stock,
    });
    expect(secondProduct).toMatchObject({
      name: secondProductInput.name,
      stock: secondProductInput.stock,
    });
    expect(getResponse.body).toEqual(firstProduct);
  });
});
