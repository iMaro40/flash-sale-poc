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

  if (!productId) {
    console.error(
      "Usage: tsx scripts/integrity-check.ts <productId> <usersAttempted>",
    );
    process.exitCode = 1;
    return;
  }

  const product = await database("products").where("id", productId).first();

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

  console.log("");
  console.log("Integrity Check");
  console.log("================================");
  console.log(`Final stock (DB):             ${product?.stock ?? "not found"}`);
  console.log(`Transactions total:           ${totalTransactions}`);
  console.log(`Transactions COMPLETED:       ${completedTransactions}`);
  console.log(`Unique users attempted:       ${usersAttempted}`);
  console.log(`Unique users completed:       ${uniqueUsersCompleted}`);
  console.log("");

  // Appended as a trailing row so report.js can combine it with the monitor.sh samples.
  const monitorRow = `,,,,,,,,,,,,,${product?.stock ?? ""},${totalTransactions},${completedTransactions},${usersAttempted},${uniqueUsersCompleted}\n`;
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
