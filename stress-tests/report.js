#!/usr/bin/env node
// Combines the k6 JSON summary with the Node/Postgres/Redis samples from monitor.sh into one report.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const POOL_MAX = 10; // must match backend/src/database/index.ts pool.max

const profile = process.argv[2] || "run";
const shouldRecord = process.argv.includes("--record");
const root = path.resolve(__dirname, "..");
const k6SummaryPath = path.join(root, "stress-tests/.last-k6-summary.json");
const monitorCsvPath = path.join(root, "stress-tests/.monitor-samples.csv");
const resultsCsvPath = path.join(root, "stress-tests/results.csv");

const k6Summary = JSON.parse(fs.readFileSync(k6SummaryPath, "utf8"));

const allRows = fs
  .readFileSync(monitorCsvPath, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .filter((line) => !line.startsWith("node_cpu_percent,"))
  .map((line) => line.split(","));

// integrity-check.ts appends one trailing row with only the final_stock..unique_users_completed
// columns filled in; keep it out of the per-second sample aggregations below.
const rows = allRows.filter((row) => row[0] !== "");
const integrityRow = allRows.find((row) => row[0] === "");

const column = (index) => rows.map((row) => Number(row[index]) || 0);
const avg = (values) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
const peak = (values) => (values.length ? Math.max(...values) : 0);
const csv = (value) => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const nodeCpu = column(0);
const nodeMemKb = column(1);
const pgActive = column(2);
const pgLockWaits = column(3);
const redisCpu = column(4);
const redisMemoryMb = rows
  .map((row) => Number.parseFloat(row[5]) || 0)
  .filter((value) => value > 0);
const avgRedisMemoryMb = avg(redisMemoryMb);
const peakPoolWaiters = column(6);
const poolAvgAcquireSeconds = column(7);
const poolP95AcquireSeconds = column(8);
const poolMaxAcquireSeconds = column(9);
const lockWaitAvgSeconds = column(10);
const lockWaitP95Seconds = column(11);
const lockWaitMaxSeconds = column(12);
const workerActiveConnections = column(22);

console.log("");

if (shouldRecord) {
  let workerConfig = {};
  try {
    workerConfig = JSON.parse(
      execFileSync(
        "curl",
        ["-fsS", "http://localhost:3001/internal/db-pool-stats"],
        { encoding: "utf8" },
      ),
    );
  } catch {
    console.error(
      "Could not read worker runtime configuration for results.csv",
    );
  }

  const integrity = integrityRow ?? [];
  const resultHeaders = [
    "recorded_at",
    "profile",
    "worker_prefetch",
    "db_pool_max",
    "duration_seconds",
    "avg_accepted_per_second",
    "avg_admit_latency_seconds",
    "p95_admit_latency_seconds",
    "p99_admit_latency_seconds",
    "error_rate_percent",
    "first_out_of_stock_seconds",
    "node_cpu_avg_percent",
    "node_cpu_peak_percent",
    "node_memory_avg_mb",
    "node_memory_peak_mb",
    "db_active_queries_avg",
    "worker_pool_connections_avg",
    "worker_pool_connections_peak",
    "row_lock_waiters_peak",
    "pool_waiters_peak",
    "avg_pool_acquire_wait_seconds",
    "p95_pool_acquire_wait_seconds",
    "peak_pool_acquire_wait_seconds",
    "avg_row_lock_wait_seconds",
    "p95_row_lock_wait_seconds",
    "peak_row_lock_wait_seconds",
    "redis_cpu_avg_percent",
    "redis_memory_avg_mb",
    "final_stock",
    "transactions_total",
    "transactions_completed",
    "unique_users_attempted",
    "unique_users_completed",
    "avg_db_completions_per_second",
    "avg_completion_latency_seconds",
    "p95_completion_latency_seconds",
    "p99_completion_latency_seconds",
  ];
  const resultValues = [
    new Date().toISOString(),
    profile,
    workerConfig.prefetch,
    workerConfig.maxConnections,
    k6Summary.durationSeconds,
    k6Summary.avgAcceptedPerSecond,
    k6Summary.avgLatencySeconds,
    k6Summary.p95LatencySeconds,
    k6Summary.p99LatencySeconds,
    k6Summary.errorRatePercent,
    k6Summary.firstOutOfStockResponseSeconds ?? k6Summary.stockRanOutAtSeconds,
    avg(nodeCpu).toFixed(0),
    peak(nodeCpu).toFixed(0),
    (avg(nodeMemKb) / 1024).toFixed(0),
    (peak(nodeMemKb) / 1024).toFixed(0),
    avg(pgActive).toFixed(0),
    avg(workerActiveConnections).toFixed(1),
    peak(workerActiveConnections),
    peak(pgLockWaits),
    peak(peakPoolWaiters),
    avg(poolAvgAcquireSeconds).toFixed(3),
    avg(poolP95AcquireSeconds).toFixed(3),
    peak(poolMaxAcquireSeconds).toFixed(3),
    avg(lockWaitAvgSeconds).toFixed(3),
    avg(lockWaitP95Seconds).toFixed(3),
    peak(lockWaitMaxSeconds).toFixed(3),
    avg(redisCpu).toFixed(0),
    avgRedisMemoryMb.toFixed(2),
    integrity[13],
    integrity[14],
    integrity[15],
    integrity[16],
    integrity[17],
    integrity[18],
    integrity[19],
    integrity[20],
    integrity[21],
  ];
  if (!fs.existsSync(resultsCsvPath)) {
    fs.writeFileSync(resultsCsvPath, `${resultHeaders.join(",")}\n`);
  }
  fs.appendFileSync(resultsCsvPath, `${resultValues.map(csv).join(",")}\n`);
}
console.log("FLASH SALE LOAD TEST");
console.log("-".repeat(40));
console.log("");
console.log(`                     ${profile.toUpperCase()}`);
console.log("HTTP (K6 ADMISSION METRICS)");
console.log(`Duration             ${k6Summary.durationSeconds}s`);
console.log(
  `Avg accepted/s       ${k6Summary.avgAcceptedPerSecond}  (admission only; see INTEGRITY for completions/s)`,
);
console.log(`Avg admit latency    ${k6Summary.avgLatencySeconds}s`);
console.log(`P95 admit latency    ${k6Summary.p95LatencySeconds}s`);
console.log(`P99 admit latency    ${k6Summary.p99LatencySeconds}s`);
console.log(`Error rate           ${k6Summary.errorRatePercent}%`);
console.log(
  `First out-of-stock   ${k6Summary.firstOutOfStockResponseSeconds ?? k6Summary.stockRanOutAtSeconds ?? "n/a"}s`,
);
console.log("");
console.log("NODE");
console.log(`CPU avg              ${avg(nodeCpu).toFixed(0)}%`);
console.log(`CPU peak             ${peak(nodeCpu).toFixed(0)}%`);
console.log(`Memory avg           ${(avg(nodeMemKb) / 1024).toFixed(0)}MB`);
console.log(`Memory peak          ${(peak(nodeMemKb) / 1024).toFixed(0)}MB`);
console.log("");
console.log("POSTGRES");
console.log(
  `Avg pool acquire wait ${avg(poolAvgAcquireSeconds).toFixed(3)}s  (avg of samples; latest 2000 acquisitions)`,
);
console.log(
  `P95 pool acquire wait ${avg(poolP95AcquireSeconds).toFixed(3)}s  (avg of samples; latest 2000 acquisitions)`,
);
console.log(
  `Peak pool acquire wait ${peak(poolMaxAcquireSeconds).toFixed(3)}s`,
);
console.log(
  `Avg row lock wait    ${avg(lockWaitAvgSeconds).toFixed(3)}s  (avg of samples; latest 2000 locks)`,
);
console.log(
  `P95 row lock wait    ${avg(lockWaitP95Seconds).toFixed(3)}s  (avg of samples; latest 2000 locks)`,
);
console.log(`Peak row lock wait   ${peak(lockWaitMaxSeconds).toFixed(3)}s`);
console.log("");
console.log("REDIS");
console.log(`CPU avg              ${avg(redisCpu).toFixed(0)}%`);
console.log(`Memory avg           ${avgRedisMemoryMb.toFixed(2)}MB`);
console.log("");

if (integrityRow) {
  const [
    ,
    ,
    ,
    ,
    ,
    ,
    ,
    ,
    ,
    ,
    ,
    ,
    ,
    finalStock,
    transactionsTotal,
    transactionsCompleted,
    usersAttempted,
    uniqueUsersCompleted,
    avgCompletedPerSecond,
    avgCompletionLatencySeconds,
    p95CompletionLatencySeconds,
    p99CompletionLatencySeconds,
  ] = integrityRow;
  console.log(
    "INTEGRITY (real DB-derived completion metrics, not k6 request-side metrics)",
  );
  console.log(`Final stock (DB)     ${finalStock}`);
  console.log(`Transactions total   ${transactionsTotal}`);
  console.log(`Transactions completed ${transactionsCompleted}`);
  console.log(`Unique users attempted ${usersAttempted}`);
  console.log(`Unique users completed ${uniqueUsersCompleted}`);
  console.log(`Avg DB completions/s  ${avgCompletedPerSecond ?? "n/a"}`);
  console.log(
    `Avg completion latency (admit->commit)  ${avgCompletionLatencySeconds || "n/a"}s`,
  );
  console.log(
    `p95 completion latency (admit->commit)  ${p95CompletionLatencySeconds || "n/a"}s`,
  );
  console.log(
    `p99 completion latency (admit->commit)  ${p99CompletionLatencySeconds || "n/a"}s`,
  );
  console.log("");
}
