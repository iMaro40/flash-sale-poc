import "./env";

import { app } from "./app";
import { connectRabbitMQ, getPublishChannel } from "./rabbitmq";
import { assertPurchaseQueue } from "./rabbitmq/queues";
import { connectRedis } from "./redis";

const port: number = Number(process.env.PORT ?? 3000);

const startServer = async (): Promise<void> => {
  await connectRedis();
  await connectRabbitMQ();
  // Declare topology once at startup instead of per-request
  await assertPurchaseQueue(getPublishChannel());

  app.listen(port, (): void => {
    console.log(`Backend server listening on port ${port}`);
  });
};

void startServer();
