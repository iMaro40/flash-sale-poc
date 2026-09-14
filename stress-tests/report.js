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

const rows = fs
  .readFileSync(monitorCsvPath, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => line.split(","));

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

console.log("");
console.log("FLASH SALE LOAD TEST");
console.log("-".repeat(40));
console.log("");
console.log(`                     ${profile.toUpperCase()}`);
console.log(`Duration             ${k6Summary.durationSeconds}s`);
console.log(`RPS                  ${k6Summary.rps}`);
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
console.log("");
console.log("REDIS");
console.log(`CPU avg              ${avg(redisCpu).toFixed(0)}%`);
console.log(`Memory               ${lastRedisMem}`);
console.log("");
