import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app";
import { closeRedis, connectRedis } from "../../src/redis";

describe("health endpoint", () => {
  beforeAll(async () => {
    await connectRedis();
  });

  afterAll(async () => {
    await closeRedis();
  });

  it("returns status ok", async () => {
    const response = await request(app).get("/health").expect(200);

    expect(response.body).toEqual({ status: "ok" });
  });
});
