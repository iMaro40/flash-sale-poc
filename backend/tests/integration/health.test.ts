import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../src/app";

describe("health endpoint", () => {
  it("returns status ok", async () => {
    const response = await request(app).get("/health").expect(200);

    expect(response.body).toEqual({ status: "ok" });
  });
});
