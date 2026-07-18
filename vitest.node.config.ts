import { defineConfig } from "vitest/config";

/**
 * The node pool: pure engines, stores, and server logic that needs no D1.
 * `src/server/db/**` is excluded here and owned by `vitest.workers.config.ts`,
 * which runs those tests against a real D1 on the workers pool.
 */
export default defineConfig({
  // Resolve the `@/*` path alias from tsconfig.json, matching astro.config.mjs,
  // so unit tests import modules the same way the app does.
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: "node",
    include: ["src/**/*.test.ts"],
    exclude: [
      "src/server/db/**",
      // Owned by the workers pool — needs a real D1 (#64).
      "src/server/checkout/**/*.workers.test.ts",
      "**/node_modules/**",
      "**/dist/**",
      "**/e2e/**",
      "**/.claude/**",
    ],
  },
});
