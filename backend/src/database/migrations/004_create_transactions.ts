import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("transactions", (table): void => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("idempotency_key").notNullable().unique();
    table.uuid("product_id").notNullable();
    table.string("user_id").notNullable();
    table.unique(["user_id", "product_id"]);
    table.foreign("product_id").references("id").inTable("products");
    table.string("status").notNullable().defaultTo("PENDING");
    table
      .timestamp("created_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp("updated_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.check(
      "?? IN (?, ?)",
      ["status", "PENDING", "COMPLETED"],
      "transactions_status_check",
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("transactions");
}
