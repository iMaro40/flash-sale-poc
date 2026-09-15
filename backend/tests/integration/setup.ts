import { beforeAll, beforeEach } from "vitest";

import { database } from "../../src/database";
import { createConsumerChannel } from "../../src/rabbitmq";
import { assertPurchaseQueue, PURCHASE_QUEUE } from "../../src/rabbitmq/queues";
import { redisClient } from "../../src/redis";

const resetIntegrationState = async (): Promise<void> => {
  await database("transactions").delete();
  await database("flash_sales").delete();
  await database("products").delete();

  if (redisClient.isOpen) {
    await redisClient.flushDb();
  }

  try {
    const channel = await createConsumerChannel();
    await assertPurchaseQueue(channel);
    await channel.purgeQueue(PURCHASE_QUEUE);
    await channel.close();
  } catch {
    // RabbitMQ is initialized in each suite's beforeAll, so this is best-effort
    // cleanup for stale messages left by earlier test runs.
  }
};

beforeAll(resetIntegrationState);
beforeEach(resetIntegrationState);
