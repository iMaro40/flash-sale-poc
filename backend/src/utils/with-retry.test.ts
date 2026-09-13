import { describe, expect, it, vi } from "vitest";

import { CustomError } from "../errors/custom-error";
import {
  calculateBackoffDelay,
  isTransientError,
  withRetry,
} from "./with-retry";

describe("withRetry", () => {
  it("returns operation result immediately on first successful attempt", async () => {
    const operation = vi.fn().mockResolvedValue("success");

    const result = await withRetry(operation);

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("retries on transient failure and succeeds on subsequent attempt", async () => {
    const transientError = new Error("Connection reset");
    const operation = vi
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce("recovered");

    const result = await withRetry(operation, {
      baseDelayMs: 1,
      maxDelayMs: 5,
    });

    expect(result).toBe("recovered");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry deterministic 4xx client errors", async () => {
    const clientError = new (class extends CustomError {
      public constructor() {
        super("Out of stock", 400);
      }
    })();
    const operation = vi.fn().mockRejectedValue(clientError);

    await expect(
      withRetry(operation, { baseDelayMs: 1, maxAttempts: 3 }),
    ).rejects.toThrow("Out of stock");

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting maxAttempts for transient errors", async () => {
    const deadlockError = Object.assign(new Error("Deadlock"), {
      code: "40P01",
    });
    const operation = vi.fn().mockRejectedValue(deadlockError);

    await expect(
      withRetry(operation, { maxAttempts: 3, baseDelayMs: 1 }),
    ).rejects.toThrow("Deadlock");

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("respects custom isRetryable predicate", async () => {
    const customError = new Error("Special failure");
    const operation = vi.fn().mockRejectedValue(customError);

    await expect(
      withRetry(operation, {
        maxAttempts: 3,
        baseDelayMs: 1,
        isRetryable: () => false,
      }),
    ).rejects.toThrow("Special failure");

    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe("isTransientError", () => {
  it("identifies Postgres deadlock (40P01) as transient", () => {
    const error = Object.assign(new Error("deadlock"), { code: "40P01" });
    expect(isTransientError(error)).toBe(true);
  });

  it("identifies 4xx errors as non-transient", () => {
    const error = Object.assign(new Error("Not found"), { statusCode: 404 });
    expect(isTransientError(error)).toBe(false);
  });
});

describe("calculateBackoffDelay", () => {
  it("calculates exponential delay without jitter", () => {
    const delay = calculateBackoffDelay(3, 50, 1000, 2, false);
    // attempt 3: 50 * 2^(3-1) = 200
    expect(delay).toBe(200);
  });

  it("caps delay at maxDelayMs", () => {
    const delay = calculateBackoffDelay(10, 50, 500, 2, false);
    expect(delay).toBe(500);
  });

  it("applies jitter within range [0, calculatedDelay]", () => {
    const delay = calculateBackoffDelay(2, 50, 1000, 2, true);
    // attempt 2: max 100
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThanOrEqual(100);
  });
});
