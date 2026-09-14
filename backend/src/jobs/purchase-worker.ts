import "../env";

import type { ConsumeMessage } from "amqplib";

import { closeDatabase } from "../database";
import { closeRedis, connectRedis } from "../redis";
import { connectRabbitMQ, createConsumerChannel } from "../rabbitmq";
import { assertPurchaseQueue, PURCHASE_QUEUE } from "../rabbitmq/queues";
import type { QueuedPurchase } from "../purchase/dto/queued-purchase";
import { purchaseService } from "../purchase/service";

// Caps how many purchase DB writes can run at the same time, regardless of how
// many purchase requests were accepted upstream. This is the actual rate limiter into Postgres.
const MAX_CONCURRENT_DB_WRITES = Number(
  process.env.PURCHASE_WORKER_PREFETCH ?? 10,
);

// Long-running worker for the dedicated docker-compose service: consumes purchase
// messages off RabbitMQ and performs the DB writes at a controlled, limited rate.
const startWorker = async (): Promise<void> => {
  await connectRedis();
  await connectRabbitMQ();

  const channel = await createConsumerChannel();
  await assertPurchaseQueue(channel);
  await channel.prefetch(MAX_CONCURRENT_DB_WRITES);

  console.log(
    `[purchase-worker] Started, maxConcurrentDbWrites=${MAX_CONCURRENT_DB_WRITES}, queue=${PURCHASE_QUEUE}`,
  );

  await channel.consume(
    PURCHASE_QUEUE,
    (message: ConsumeMessage | null): void => {
      if (!message) {
        return;
      }

      void (async (): Promise<void> => {
        try {
          const queuedPurchase = JSON.parse(
            message.content.toString(),
          ) as QueuedPurchase;

          await purchaseService.completePurchase(
            queuedPurchase.input,
            queuedPurchase.transactionId,
          );
          channel.ack(message);
        } catch (error) {
          console.error("[purchase-worker] Failed to process purchase", error);
          try {
            const queuedPurchase = JSON.parse(
              message.content.toString(),
            ) as QueuedPurchase;
            await purchaseService.cancelPurchase(
              queuedPurchase.transactionId,
              queuedPurchase.input,
            );
          } catch (cancellationError) {
            console.error(
              "[purchase-worker] Failed to cancel purchase",
              cancellationError,
            );
          }
          channel.nack(message, false, false);
        }
      })();
    },
  );
};

void startWorker();

process.on("SIGTERM", (): void => {
  void (async (): Promise<void> => {
    await Promise.all([closeRedis(), closeDatabase()]);
    process.exit(0);
  })();
});
