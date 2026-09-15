import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    // The app enforces a single global product row; running files in parallel
    // makes separate test files race for that same singleton.
    fileParallelism: false,
  },
});
