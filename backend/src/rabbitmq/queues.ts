import type { Channel } from "amqplib";

// Rate control: consumers cap how many messages they handle at once so Postgres
// only sees a limited number of concurrent purchase writes, regardless of HTTP request volume.
export const PURCHASE_QUEUE = "purchase.process";
export const PURCHASE_DEAD_LETTER_EXCHANGE = "purchase.process.dlx";
export const PURCHASE_DEAD_LETTER_QUEUE = "purchase.process.dlq";

export const assertPurchaseQueue = async (channel: Channel): Promise<void> => {
  await channel.assertExchange(PURCHASE_DEAD_LETTER_EXCHANGE, "direct", {
    durable: true,
  });
  await channel.assertQueue(PURCHASE_DEAD_LETTER_QUEUE, { durable: true });
  await channel.bindQueue(
    PURCHASE_DEAD_LETTER_QUEUE,
    PURCHASE_DEAD_LETTER_EXCHANGE,
    PURCHASE_QUEUE,
  );
  await channel.assertQueue(PURCHASE_QUEUE, {
    durable: true,
    deadLetterExchange: PURCHASE_DEAD_LETTER_EXCHANGE,
    deadLetterRoutingKey: PURCHASE_QUEUE,
  });
};
