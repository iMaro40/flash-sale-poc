import { config } from "dotenv";
import { resolve } from "node:path";

import { knex, type Knex } from "knex";

config({ path: resolve(__dirname, "../../.env") });

const connection = {
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "postgres",
  password: process.env.POSTGRES_PASSWORD ?? "postgres",
  database: process.env.POSTGRES_DB ?? "flash_sale",
};

export const database: Knex = knex({
  client: "pg",
  connection,
  pool: {
    min: 2,
    max: 10,
  },
});

export const closeDatabase = async (): Promise<void> => {
  await database.destroy();
};
