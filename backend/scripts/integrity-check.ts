import { closeDatabase, database } from "../src/database";

interface CountRow {
  count: string;
}

const run = async (): Promise<void> => {
  const productId = process.argv[2];

  if (!productId) {
    console.error("Usage: tsx scripts/integrity-check.ts <productId>");
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

  const [{ count: uniqueUsers }] = await database<CountRow>("transactions")
    .where("product_id", productId)
    .countDistinct<CountRow[]>("user_id as count");

  console.log("");
  console.log("Integrity Check");
  console.log("================================");
  console.log(`Final stock (DB):         ${product?.stock ?? "not found"}`);
  console.log(`Transactions total:       ${totalTransactions}`);
  console.log(`Transactions COMPLETED:   ${completedTransactions}`);
  console.log(`Unique users transacted:  ${uniqueUsers}`);
  console.log("");
};

run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally((): void => {
    void closeDatabase();
  });
