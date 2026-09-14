#!/usr/bin/env node
// Combines the k6 JSON summary with the Node/Postgres/Redis samples from monitor.sh into one report.
const fs = require("fs");
const path = require("path");

const POOL_MAX = 10; // must match backend/src/database/index.ts pool.max

const profile = process.argv[2] || "run";
const root = path.resolve(__dirname, "..");
const k6SummaryPath = path.join(root, "stress-tests/.last-k6-summary.json");
const monitorCsvPath = path.join(root, "stress-tests/.monitor-samples.csv");

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

const nodeCpu = column(0);
const nodeMemKb = column(1);
const pgActive = column(2);
const pgLockWaits = column(3);
const redisCpu = column(4);
const lastRedisMem = rows.length ? rows[rows.length - 1][5] : "n/a";
const poolPendingAcquires = column(6);
const poolAvgAcquireSeconds = column(7);
const poolP95AcquireSeconds = column(8);
const poolMaxAcquireSeconds = column(9);
const lockWaitAvgSeconds = column(10);
const lockWaitP95Seconds = column(11);
const lockWaitMaxSeconds = column(12);

console.log("");
console.log("FLASH SALE LOAD TEST");
console.log("-".repeat(40));
console.log("");
console.log(`                     ${profile.toUpperCase()}`);
console.log(`Duration             ${k6Summary.durationSeconds}s`);
console.log(`Avg succeeded/s      ${k6Summary.avgSucceededPerSecond}`);
console.log(`avg latency          ${k6Summary.avgLatencySeconds}s`);
console.log(`p95 latency          ${k6Summary.p95LatencySeconds}s`);
console.log(`p99 latency          ${k6Summary.p99LatencySeconds}s`);
console.log(`Error rate           ${k6Summary.errorRatePercent}%`);
console.log(`Stock ran out at     ${k6Summary.stockRanOutAtSeconds}s`);
console.log("");
console.log("NODE");
console.log(`CPU avg              ${avg(nodeCpu).toFixed(0)}%`);
console.log(`CPU peak             ${peak(nodeCpu).toFixed(0)}%`);
console.log(`Memory avg           ${(avg(nodeMemKb) / 1024).toFixed(0)}MB`);
console.log(`Memory peak          ${(peak(nodeMemKb) / 1024).toFixed(0)}MB`);
console.log("");
console.log("POSTGRES");
console.log(`Active connections   ${avg(pgActive).toFixed(0)}`);
console.log(
  `Pool utilization     ${((avg(pgActive) / POOL_MAX) * 100).toFixed(0)}%`,
);
console.log(`Lock waits           ${peak(pgLockWaits)}`);
console.log(`Pending acquires     ${peak(poolPendingAcquires)}`);
console.log(
  `Avg acquire wait     ${avg(poolAvgAcquireSeconds).toFixed(3)}s  (latest 2000 requests)`,
);
console.log(
  `p95 acquire wait     ${avg(poolP95AcquireSeconds).toFixed(3)}s  (latest 2000 requests)`,
);
console.log(`Peak acquire wait    ${peak(poolMaxAcquireSeconds).toFixed(3)}s`);
console.log(
  `Avg lock wait        ${avg(lockWaitAvgSeconds).toFixed(3)}s  (latest 2000 requests)`,
);
console.log(
  `p95 lock wait        ${avg(lockWaitP95Seconds).toFixed(3)}s  (latest 2000 requests)`,
);
console.log(`Peak lock wait       ${peak(lockWaitMaxSeconds).toFixed(3)}s`);
console.log("");
console.log("REDIS");
console.log(`CPU avg              ${avg(redisCpu).toFixed(0)}%`);
console.log(`Memory               ${lastRedisMem}`);
console.log("");

if (integrityRow) {
  const [, , , , , , , , , , , , , finalStock, transactionsTotal, transactionsCompleted, usersAttempted, uniqueUsersCompleted] =
    integrityRow;
  console.log("INTEGRITY");
  console.log(`Final stock (DB)     ${finalStock}`);
  console.log(`Transactions total   ${transactionsTotal}`);
  console.log(`Transactions done    ${transactionsCompleted}`);
  console.log(`Users attempted      ${usersAttempted}`);
  console.log(`Users completed      ${uniqueUsersCompleted}`);
  console.log("");
}
