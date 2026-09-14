import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeDatabase, database } from "../src/database";

interface CountRow {
  count: string;
}

const MONITOR_CSV_PATH = resolve(
  __dirname,
  "../../stress-tests/.monitor-samples.csv",
);

const run = async (): Promise<void> => {
  const productId = process.argv[2];
  // Passed in from k6 since rejected attempts (e.g. out of stock) never create a transaction row.
  const usersAttempted = process.argv[3] ?? "unknown";
  // Passed in from k6's setup() so stock conservation can be asserted, not just reported.
  const initialStockArg = process.argv[4];

  if (!productId) {
    console.error(
      "Usage: tsx scripts/integrity-check.ts <productId> <usersAttempted> <initialStock>",
    );
    process.exitCode = 1;
    return;
  }

  const initialStock =
    initialStockArg !== undefined ? Number(initialStockArg) : undefined;

  const product = await database("products").where("id", productId).first();
  const finalStock: number | undefined = product?.stock;

  const [{ count: totalTransactions }] = await database<CountRow>(
    "transactions",
  )
    .where("product_id", productId)
    .count<CountRow[]>("id as count");

  const [{ count: completedTransactions }] = await database<CountRow>(
    "transactions",
  )
    .where("product_id", productId)
    .andWhere("status", "COMPLETED")
    .count<CountRow[]>("id as count");

  const [{ count: uniqueUsersCompleted }] = await database<CountRow>(
    "transactions",
  )
    .where("product_id", productId)
    .andWhere("status", "COMPLETED")
    .countDistinct<CountRow[]>("user_id as count");

  const completed = Number(completedTransactions);
  const uniqueCompleted = Number(uniqueUsersCompleted);

  // Real completion throughput/latency, unlike k6's request-side metrics: purchases are async
  // now (HTTP 202 just means "queued"), so the only place the true worker/DB completion rate and
  // end-to-end latency (admission -> worker commit) can be measured is Postgres timestamps.
  const completionRows = await database<{ latency_seconds: string }>(
    "transactions",
  )
    .where("product_id", productId)
    .andWhere("status", "COMPLETED")
    .select(
      database.raw("EXTRACT(EPOCH FROM (updated_at - created_at)) as latency_seconds"),
    );
  const completionLatenciesSeconds = completionRows
    .map((row) => Number(row.latency_seconds))
    .sort((a, b) => a - b);
  const percentile = (values: number[], p: number): number | undefined => {
    if (values.length === 0) return undefined;
    const index = Math.min(
      values.length - 1,
      Math.floor(p * values.length),
    );
    return values[index];
  };
  const avgLatencySeconds =
    completionLatenciesSeconds.length > 0
      ? completionLatenciesSeconds.reduce((sum, v) => sum + v, 0) /
        completionLatenciesSeconds.length
      : undefined;

  const throughputRows = await database<{ completed_at: Date }>("transactions")
    .where("product_id", productId)
    .andWhere("status", "COMPLETED")
    .select("updated_at as completed_at");
  const completionsPerSecondBucket = new Map<number, number>();
  for (const row of throughputRows) {
    const bucketMs = Math.floor(new Date(row.completed_at).getTime() / 1000) * 1000;
    completionsPerSecondBucket.set(
      bucketMs,
      (completionsPerSecondBucket.get(bucketMs) ?? 0) + 1,
    );
  }
  const bucketValues = [...completionsPerSecondBucket.values()];
  const peakCompletedPerSecond = bucketValues.length > 0 ? Math.max(...bucketValues) : 0;
  const activeSeconds = completionsPerSecondBucket.size;
  const avgCompletedPerSecond =
    activeSeconds > 0 ? completed / activeSeconds : 0;

  console.log("");
  console.log("Integrity Check");
  console.log("================================");
  console.log(`Final stock (DB):             ${finalStock ?? "not found"}`);
  console.log(`Transactions total:           ${totalTransactions}`);
  console.log(`Transactions COMPLETED:       ${completedTransactions}`);
  console.log(`Unique users attempted:       ${usersAttempted}`);
  console.log(`Unique users completed:       ${uniqueUsersCompleted}`);
  console.log("");
  console.log("Real completion throughput/latency (from Postgres, not k6):");
  console.log(`  Avg completed/s (over active seconds):  ${avgCompletedPerSecond.toFixed(1)}`);
  console.log(`  Peak completed/s (any single second):    ${peakCompletedPerSecond}`);
  console.log(
    `  Completion latency avg/p50/p95/max (s):  ${avgLatencySeconds?.toFixed(3) ?? "n/a"} / ${percentile(completionLatenciesSeconds, 0.5)?.toFixed(3) ?? "n/a"} / ${percentile(completionLatenciesSeconds, 0.95)?.toFixed(3) ?? "n/a"} / ${completionLatenciesSeconds.at(-1)?.toFixed(3) ?? "n/a"}`,
  );
  console.log("");

  const failures: string[] = [];

  // Stock lost/gained anywhere in the reserve -> DB decrement -> release pipeline shows up here.
  if (initialStock !== undefined && finalStock !== undefined) {
    const expectedFinalStock = initialStock - completed;
    if (finalStock !== expectedFinalStock) {
      failures.push(
        `Stock conservation violated: expected ${expectedFinalStock} (initial ${initialStock} - completed ${completed}), got ${finalStock}`,
      );
    }
  }

  // The UNIQUE(user_id, product_id) constraint should already prevent this; assert it anyway.
  if (uniqueCompleted !== completed) {
    failures.push(
      `Duplicate purchases detected: ${completed} COMPLETED transactions but only ${uniqueCompleted} unique users`,
    );
  }

  if (failures.length === 0) {
    console.log("All invariants held.");
  } else {
    console.log("INVARIANT VIOLATIONS:");
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    process.exitCode = 1;
  }
  console.log("");

  // Appended as a trailing row so report.js can combine it with the monitor.sh samples.
  const monitorRow = `,,,,,,,,,,,,,${finalStock ?? ""},${totalTransactions},${completedTransactions},${usersAttempted},${uniqueUsersCompleted},${avgCompletedPerSecond.toFixed(1)},${peakCompletedPerSecond},${avgLatencySeconds?.toFixed(3) ?? ""},${percentile(completionLatenciesSeconds, 0.95)?.toFixed(3) ?? ""}\n`;
  appendFileSync(MONITOR_CSV_PATH, monitorRow);
};

run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally((): void => {
    void closeDatabase();
  });
