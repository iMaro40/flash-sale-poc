# Copilot Coding Standards

1. Use `src/<domain>/...` structure.
   - Example: `src/flash-sale/service.ts` and `src/flash-sale/controller.ts`

2. Prefer explicit return types.

3. Attempt to validate request data before business logic.

4. Put Zod schemas in `src/<domain>/schema.ts`.

5. Put interface data models in `src/<domain>/model.ts`.

6. Use camelCase for application variables, service inputs, and repository method inputs. Use snake_case only for database fields and SQL column mappings.

7. Prefer named imports over default imports when the module exports named bindings. Example: `import { resolve } from "node:path";` and `import { config } from "dotenv";`.

8. Controllers should use try/catch and delegate errors to centralized error-handling middleware.

9. Preserve existing code comments. Do not remove or rewrite comments unless explicitly requested.

10. Keep `model.ts` for data models only. Put function argument types in `service.ts` and `repository.ts` for now.

11. Put shared DTO types in `src/<domain>/dto/<name>.ts` when a type is used across controller, service, and repository layers.

12. For Knex `GET`/read queries, pass the row type to query-builder operations, for example `db<DatabaseRow>("table_name")`. Explicit row types are not required for inserts unless needed for clarity.

13. Repository methods should return domain model types, not database row types. Keep snake_case database fields and row-to-domain mapping internal to the repository.

14. Unit tests should cover both happy paths and negative paths for each public behavior.

## Execution Mode

- Apply code changes directly without extra confirmation prompts.
- Implement requests end-to-end unless blocked.
- Keep edits minimal and scoped to the request.
- Do not run typecheck/build/test commands unless explicitly requested.
