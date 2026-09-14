import type { Channel, ConsumeMessage } from "amqplib";
import { describe, expect, it, vi } from "vitest";

import type { PurchaseProductInput } from "../purchase/dto/purchase-product";
import { processPurchaseMessage } from "./purchase-worker-handler";

const input: PurchaseProductInput = {
  productId: "product-1",
  userId: "user-1",
  idempotencyKey: "idempotency-1",
};

const createMessage = (content: unknown): ConsumeMessage =>
  ({ content: Buffer.from(JSON.stringify(content)) }) as ConsumeMessage;

const createChannel = (): {
  channel: Channel;
  ack: ReturnType<typeof vi.fn>;
  nack: ReturnType<typeof vi.fn>;
} => {
  const ack = vi.fn();
  const nack = vi.fn();
  return {
    channel: { ack, nack } as unknown as Channel,
    ack,
    nack,
  };
};

describe("processPurchaseMessage", () => {
  it("completes the purchase and acknowledges the message", async () => {
    const message = createMessage({ transactionId: "transaction-1", input });
    const { channel, ack, nack } = createChannel();
    const completePurchase = vi.fn().mockResolvedValue(undefined);
    const cancelPurchase = vi.fn();

    await processPurchaseMessage(message, channel, {
      completePurchase,
      cancelPurchase,
    });

    expect(completePurchase).toHaveBeenCalledWith(input, "transaction-1");
    expect(cancelPurchase).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(message);
    expect(nack).not.toHaveBeenCalled();
  });

  it("cancels and dead-letters a failed purchase without requeueing", async () => {
    const message = createMessage({ transactionId: "transaction-1", input });
    const { channel, ack, nack } = createChannel();
    const error = new Error("database failure");
    const completePurchase = vi.fn().mockRejectedValue(error);
    const cancelPurchase = vi.fn().mockResolvedValue(undefined);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await processPurchaseMessage(message, channel, {
      completePurchase,
      cancelPurchase,
    });

    expect(cancelPurchase).toHaveBeenCalledWith("transaction-1", input);
    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(message, false, false);
    expect(log).toHaveBeenCalledWith(
      "[purchase-worker] Failed to process purchase",
      error,
    );
    log.mockRestore();
  });

  it("retries transient completion failures before acknowledging", async () => {
    const message = createMessage({ transactionId: "transaction-1", input });
    const { channel, ack, nack } = createChannel();
    const transientError = Object.assign(new Error("connection reset"), {
      code: "ECONNRESET",
    });
    const completePurchase = vi
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce(undefined);
    const cancelPurchase = vi.fn();

    await processPurchaseMessage(message, channel, {
      completePurchase,
      cancelPurchase,
    });

    expect(completePurchase).toHaveBeenCalledTimes(2);
    expect(cancelPurchase).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(message);
    expect(nack).not.toHaveBeenCalled();
  });

  it("dead-letters malformed messages without attempting cancellation", async () => {
    const message = {
      content: Buffer.from("not-json"),
    } as ConsumeMessage;
    const { channel, ack, nack } = createChannel();
    const completePurchase = vi.fn();
    const cancelPurchase = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await processPurchaseMessage(message, channel, {
      completePurchase,
      cancelPurchase,
    });

    expect(completePurchase).not.toHaveBeenCalled();
    expect(cancelPurchase).not.toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(message, false, false);
    log.mockRestore();
  });
});
