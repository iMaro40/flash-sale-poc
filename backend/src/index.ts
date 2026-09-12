import { config } from "dotenv";
import { resolve } from "node:path";

import { app } from "./app";
import { connectRedis } from "./redis";

config({ path: resolve(__dirname, "../../.env") });

const port: number = Number(process.env.PORT ?? 3000);

const startServer = async (): Promise<void> => {
  await connectRedis();

  app.listen(port, (): void => {
    console.log(`Backend server listening on port ${port}`);
  });
};

void startServer();
