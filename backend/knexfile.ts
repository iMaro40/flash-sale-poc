import dotenv from "dotenv";
import path from "node:path";

import type { Knex } from "knex";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const config: Knex.Config = {
  client: "pg",
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: "./src/database/migrations",
    extension: "ts",
    loadExtensions: [".ts"],
  },
};

export default config;
