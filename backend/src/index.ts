import "./env";

import { app } from "./app";
import { connectRedis } from "./redis";

const port: number = Number(process.env.PORT ?? 3000);

const startServer = async (): Promise<void> => {
  await connectRedis();

  app.listen(port, (): void => {
    console.log(`Backend server listening on port ${port}`);
  });
};

void startServer();
