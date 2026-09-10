import { Pool } from "pg";

export const pool: Pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // TO DO: What is number of connections I should open given my hardware constraints and problem constraints?
  // I should put an explicit number her to show I thought about number of connections
});

export const connectDatabase = async (): Promise<void> => {
  if (
    process.env.DATABASE_URL === undefined ||
    process.env.DATABASE_URL.trim().length === 0
  ) {
    throw new Error("DATABASE_URL is required");
  }

  // Simple health check
  await pool.query("SELECT 1");
};

export const closeDatabase = async (): Promise<void> => {
  await pool.end();
};
