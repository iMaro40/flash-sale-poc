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

// Ring buffer of recent "time spent waiting for a pool connection" samples (ms), so
// getDbPoolStats() can report avg/p95/max without an unbounded array or per-request shift() cost.
// Basically just gets latest 2000 requests all the time
const ACQUIRE_SAMPLE_CAPACITY = 2000;
const acquireDurationsMs = new Float64Array(ACQUIRE_SAMPLE_CAPACITY);
let acquireSampleIndex = 0;
let acquireSampleCount = 0;
const acquireStartTimes = new Map<number, number>();

const recordAcquireDurationMs = (durationMs: number): void => {
  acquireDurationsMs[acquireSampleIndex] = durationMs;
  acquireSampleIndex = (acquireSampleIndex + 1) % ACQUIRE_SAMPLE_CAPACITY;
  acquireSampleCount = Math.min(
    acquireSampleCount + 1,
    ACQUIRE_SAMPLE_CAPACITY,
  );
};

pool.on("acquireRequest", (eventId) => {
  acquireStartTimes.set(eventId, Date.now());
});
pool.on("acquireSuccess", (eventId) => {
  const startedAt = acquireStartTimes.get(eventId);
  if (startedAt !== undefined) {
    recordAcquireDurationMs(Date.now() - startedAt);
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
  acquireSampleCount: number;
  avgAcquireSeconds: number;
  p95AcquireSeconds: number;
  maxAcquireSeconds: number;
}

// How long requests actually wait to get a pool connection, separate from time spent waiting on a
// Postgres row lock after a connection is already held (that's pg_locks, tracked in monitor.sh).
export const getDbPoolStats = (): DbPoolStats => {
  const samples = Array.from(
    acquireDurationsMs.slice(0, acquireSampleCount),
  ).sort((a, b) => a - b);
  const avgAcquireMs = samples.length
    ? samples.reduce((sum, value) => sum + value, 0) / samples.length
    : 0;
  const p95AcquireMs = samples.length
    ? samples[Math.floor(samples.length * 0.95)]
    : 0;
  const maxAcquireMs = samples.length ? samples[samples.length - 1] : 0;

  return {
    activeConnections: pool.numUsed(),
    freeConnections: pool.numFree(),
    pendingAcquires: pool.numPendingAcquires(),
    acquireSampleCount: samples.length,
    avgAcquireSeconds: Number((avgAcquireMs / 1000).toFixed(3)),
    p95AcquireSeconds: Number((p95AcquireMs / 1000).toFixed(3)),
    maxAcquireSeconds: Number((maxAcquireMs / 1000).toFixed(3)),
  };
};
