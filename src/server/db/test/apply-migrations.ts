import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";

/**
 * Bring the per-test D1 up to the current schema + seed before any db test runs.
 * `TEST_MIGRATIONS` is the plain-SQL migration set read from `drizzle/migrations`
 * in `vitest.workers.config.ts` (node side, where `fs` exists) and injected as a
 * miniflare binding; `applyD1Migrations` applies exactly what `wrangler d1
 * migrations apply` would, so tests exercise the same migrated database prod gets
 * — fixture seed (0001) included.
 *
 * `TEST_MIGRATIONS` is a test-only binding, not part of the wrangler-declared
 * env, so it is cast in here rather than widening the global `Cloudflare.Env`
 * that production code sees.
 */
const { TEST_MIGRATIONS } = env as Cloudflare.Env & {
  TEST_MIGRATIONS: D1Migration[];
};

await applyD1Migrations(env.DB, TEST_MIGRATIONS);
