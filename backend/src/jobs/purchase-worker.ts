import "../env";

import { createServer } from "node:http";

import type { ConsumeMessage } from "amqplib";

import { closeDatabase, getDbPoolStats } from "../database";
import { closeRedis, connectRedis } from "../redis";
import { connectRabbitMQ, createConsumerChannel } from "../rabbitmq";
import { assertPurchaseQueue, PURCHASE_QUEUE } from "../rabbitmq/queues";
import { getStockDecrementLockWaitStats } from "../product/repository";
import { purchaseService } from "../purchase/service";
import { processPurchaseMessage } from "./purchase-worker-handler";

// Caps how many purchase DB writes can run at the same time, regardless of how
// many purchase requests were accepted upstream. This is the actual rate limiter into Postgres.
const MAX_CONCURRENT_DB_WRITES = Number(200);

// Serves this process's own pool/lock-wait stats: the API server's pool barely contends,
// so monitor.sh must poll the worker (where decrementStockByProductId actually runs) instead.
const startMetricsServer = (): void => {
  const port = Number(process.env.PURCHASE_WORKER_METRICS_PORT ?? 3001);

  createServer((_request, response): void => {
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        ...getDbPoolStats(),
        stockDecrementLockWait: getStockDecrementLockWaitStats(),
      }),
    );
  }).listen(port, (): void => {
    console.log(`[purchase-worker] Metrics server listening on port ${port}`);
  });
};

// Long-running worker for the dedicated docker-compose service: consumes purchase
// messages off RabbitMQ and performs the DB writes at a controlled, limited rate.
const startWorker = async (): Promise<void> => {
  startMetricsServer();
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

      void processPurchaseMessage(message, channel, purchaseService);
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
