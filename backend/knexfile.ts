import "./src/env";

import type { Knex } from "knex";

const connection = {
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? "postgres",
  password: process.env.POSTGRES_PASSWORD ?? "postgres",
  database: process.env.POSTGRES_DB ?? "flash_sale",
};

const knexConfig: Knex.Config = {
  client: "pg",
  connection,
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: "./src/database/migrations",
    extension: "ts",
    loadExtensions: [".ts"],
  },
};

export default knexConfig;
