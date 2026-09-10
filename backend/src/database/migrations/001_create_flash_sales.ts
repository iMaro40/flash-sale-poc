import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  await knex.schema.createTable("flash_sales", (table): void => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("product_id").notNullable();
    table.timestamp("start_time", { useTz: true }).notNullable();
    table.timestamp("end_time", { useTz: true }).notNullable();
    table.uuid("user_id").notNullable();
    table.check(
      "?? > ??",
      ["end_time", "start_time"],
      "flash_sales_time_order_check",
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("flash_sales");
}
