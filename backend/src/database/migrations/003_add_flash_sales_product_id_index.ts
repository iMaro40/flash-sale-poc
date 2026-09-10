import type { Knex } from "knex";

const indexName = "flash_sales_product_id_index";

// Add an index on the product_id column to optimize findActiveFlashSaleByProductId
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("flash_sales", (table): void => {
    table.index(["product_id"], indexName);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("flash_sales", (table): void => {
    table.dropIndex(["product_id"], indexName);
  });
}
