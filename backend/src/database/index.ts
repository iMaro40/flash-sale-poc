import { config } from "dotenv";
import { resolve } from "node:path";

import { knex, type Knex } from "knex";

import { createDurationSampler, type DurationStats } from "../utils/duration-sampler";

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

// Tarn (knex's pool) emits these but doesn't type them; minimal shape for what we use below.
interface PoolWithEvents {
  on(event: "acquireRequest", listener: (eventId: number) => void): void;
  on(event: "acquireSuccess", listener: (eventId: number) => void): void;
  on(event: "acquireFail", listener: (eventId: number) => void): void;
  numUsed(): number;
  numFree(): number;
  numPendingAcquires(): number;
}

const pool = (database.client as unknown as { pool: PoolWithEvents }).pool;

// How long requests wait for a pool connection, separate from time spent waiting on a Postgres row
// lock after a connection is already held (that's getStockDecrementLockWaitStats, in product/repository.ts).
const acquireDurationSampler = createDurationSampler(2000);
const acquireStartTimes = new Map<number, number>();

pool.on("acquireRequest", (eventId) => {
  acquireStartTimes.set(eventId, Date.now());
});
pool.on("acquireSuccess", (eventId) => {
  const startedAt = acquireStartTimes.get(eventId);
  if (startedAt !== undefined) {
    acquireDurationSampler.record(Date.now() - startedAt);
    acquireStartTimes.delete(eventId);
  }
});
pool.on("acquireFail", (eventId) => {
  acquireStartTimes.delete(eventId);
});

export interface DbPoolStats {
  activeConnections: number;
  freeConnections: number;
  pendingAcquires: number;
  acquireWait: DurationStats;
}

export const getDbPoolStats = (): DbPoolStats => ({
  activeConnections: pool.numUsed(),
  freeConnections: pool.numFree(),
  pendingAcquires: pool.numPendingAcquires(),
  acquireWait: acquireDurationSampler.stats(),
});
