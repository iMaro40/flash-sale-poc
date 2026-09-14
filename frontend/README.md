# Frontend

Three prefilled forms for creating products, creating flash sales, and purchasing products, built with React, TypeScript, and Vite, with ESLint.

Run the backend with `pnpm server` in another terminal (with its database and Redis running). Vite proxies `/api` requests to `http://localhost:3000`; update `vite.config.ts` if your backend uses a different port. This proxy is for development; a production deployment needs equivalent API routing.

Create a product first: its returned ID fills both other forms automatically. Sale times use your local timezone and are sent as ISO timestamps. Purchase retries retain the same generated idempotency key; changing the product or user creates a new key.

Run from the repository root:

```sh
pnpm install
pnpm --filter frontend dev
```

Open the local URL printed by Vite.

```sh
pnpm --filter frontend build
pnpm --filter frontend lint
pnpm --filter frontend preview
```
