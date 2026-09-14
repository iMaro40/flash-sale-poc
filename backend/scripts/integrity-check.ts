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

  console.log("");
  console.log("Integrity Check");
  console.log("================================");
  console.log(`Final stock (DB):             ${finalStock ?? "not found"}`);
  console.log(`Transactions total:           ${totalTransactions}`);
  console.log(`Transactions COMPLETED:       ${completedTransactions}`);
  console.log(`Unique users attempted:       ${usersAttempted}`);
  console.log(`Unique users completed:       ${uniqueUsersCompleted}`);
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
  const monitorRow = `,,,,,,,,,,,,,${finalStock ?? ""},${totalTransactions},${completedTransactions},${usersAttempted},${uniqueUsersCompleted}\n`;
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
