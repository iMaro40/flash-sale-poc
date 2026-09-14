import type { Channel } from "amqplib";

// Rate control: consumers cap how many messages they handle at once so Postgres
// only sees a limited number of concurrent purchase writes, regardless of HTTP request volume.
export const PURCHASE_QUEUE = "purchase.process";

export const assertPurchaseQueue = async (channel: Channel): Promise<void> => {
  await channel.assertQueue(PURCHASE_QUEUE, { durable: true });
};
