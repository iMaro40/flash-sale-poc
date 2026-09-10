import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("products", (table): void => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name").notNullable();
    table.integer("stock").notNullable();
    table.check("?? >= 0", ["stock"], "products_stock_nonnegative_check");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("products");
}
