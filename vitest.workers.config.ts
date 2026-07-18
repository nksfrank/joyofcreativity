import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * The workers pool: `src/server/db/**` tests, run against a *real* migrated D1
 * with per-test isolated storage (#60). Bindings (the `DB` D1 database, compat
 * date/flags) come from wrangler.jsonc so the test D1 is configured exactly like
 * dev and prod — one runtime driver everywhere. The plain-SQL migrations are
 * read here and handed to the setup file as `TEST_MIGRATIONS`, which applies
 * them before each test file (see `src/server/db/test/apply-migrations.ts`).
 *
 * `@cloudflare/vitest-pool-workers` 0.18 (the vitest 4 line) exposes the pool as
 * the `cloudflareTest()` plugin — the older `defineWorkersProject` +
 * `poolOptions.workers` shape was removed.
 */
export default defineConfig(async () => {
  const migrations = await readD1Migrations("./drizzle/migrations");

  return {
    resolve: {
      tsconfigPaths: true,
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      name: "workers",
      include: ["src/server/db/**/*.test.ts"],
      setupFiles: ["./src/server/db/test/apply-migrations.ts"],
    },
  };
});
