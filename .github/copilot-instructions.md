# Copilot Coding Standards

1. Use `src/<domain>/...` structure.
   - Example: `src/flash-sale/service.ts` and `src/flash-sale/controller.ts`

2. Prefer explicit return types.

3. Attempt to validate request data before business logic.

4. Put Zod schemas in `src/<domain>/schema.ts`.

5. Put interface data models in `src/<domain>/model.ts`.

6. Use camelCase for application variables, service inputs, and repository method inputs. Use snake_case only for database fields and SQL column mappings.

7. Controllers should use try/catch and delegate errors to centralized error-handling middleware.

8. Preserve existing code comments. Do not remove or rewrite comments unless explicitly requested.

9. Keep `model.ts` for data models only. Put function argument types in `service.ts` and `repository.ts` for now.

10. Put shared DTO types in `src/<domain>/dto/<name>.ts` when a type is used across controller, service, and repository layers.

## Execution Mode

- Apply code changes directly without extra confirmation prompts.
- Implement requests end-to-end unless blocked.
- Keep edits minimal and scoped to the request.
- Do not run typecheck/build/test commands unless explicitly requested.
