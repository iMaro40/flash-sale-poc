import type { Knex } from "knex";

// A CANCELLED transaction should not permanently block a user from retrying a
// purchase for the same product, so uniqueness is now only enforced across
// active (PENDING/COMPLETED) transactions via a partial unique index.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("transactions", (table): void => {
    table.dropUnique(["user_id", "product_id"]);
  });
  await knex.raw(`
    CREATE UNIQUE INDEX transactions_user_id_product_id_active_unique
    ON transactions (user_id, product_id)
    WHERE status <> 'CANCELLED'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    "DROP INDEX IF EXISTS transactions_user_id_product_id_active_unique",
  );
  await knex.schema.alterTable("transactions", (table): void => {
    table.unique(["user_id", "product_id"]);
  });
}
