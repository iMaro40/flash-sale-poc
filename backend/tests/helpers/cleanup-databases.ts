import { closeDatabase, database } from "../../src/database";
import { redisClient } from "../../src/redis";

export const cleanupDatabases = async (): Promise<void> => {
  await database("transactions").delete();
  await database("flash_sales").delete();
  await database("products").delete();

  if (redisClient.isOpen) {
    await redisClient.flushDb();
  }

  await closeDatabase();
};
