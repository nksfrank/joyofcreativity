import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve the `@/*` path alias from tsconfig.json, matching astro.config.mjs,
  // so unit tests import modules the same way the app does.
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**", "**/.claude/**"],
  },
});
