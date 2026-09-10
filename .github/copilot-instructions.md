# Copilot Coding Standards

1. Use `src/<domain>/...` structure.
   - Example: `src/flash-sale/service.ts` and `src/flash-sale/controller.ts`

2. Prefer explicit return types.

3. Attempt to validate request data before business logic.

4. Put Zod schemas in `src/<domain>/schema.ts`.

5. Put interface data models in `src/<domain>/model.ts`.

6. Use camelCase for application variables and fields. Use snake_case only for database fields (for example PostgreSQL column mappings).

7. Controllers should use try/catch and delegate errors to centralized error-handling middleware.

## Execution Mode

- Apply code changes directly without extra confirmation prompts.
- Implement requests end-to-end unless blocked.
- Keep edits minimal and scoped to the request.
- Do not run typecheck/build/test commands unless explicitly requested.
