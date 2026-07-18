# 15. D1 + Drizzle operational contract: one runtime driver, authoring ≠ application, real-D1 test seam

Status: Accepted

## Context

The server surface (ADR-0013) has no persistence. The transact+fulfil foundation spec (#54,
map #28) needs the shop's first durable memory before orders, Stripe, or checkout can be built.
Issue #60 lands that foundation as a **Cloudflare D1** database holding a `stock` table (orders
come later), and — more importantly — fixes the whole operational contract for how Drizzle and D1
relate, so every later table (#34/#35 reservations, orders) follows one shape instead of
re-litigating it.

Two facts constrain the shape:

- **`@astrojs/cloudflare` 14 runs dev on real `workerd`** (ADR-0013): a D1 binding declared in
  `wrangler.jsonc` is a real D1 in dev, test, and prod. There is no node-side SQLite to emulate
  against.
- **`Astro.locals.runtime.env` was removed** in the installed adapter (ADR-0013). Issue #60's
  acceptance text says bindings are read via `Astro.locals.runtime.env`; that API does not exist
  here. This ADR supersedes that wording with the ADR-0013 contract: bindings come from
  `import { env } from "cloudflare:workers"` at the Action boundary and are passed into `server/`.

## Decision

**One runtime driver everywhere: `drizzle-orm/d1` over a real D1 binding.** Dev gets the binding
from `astro dev`'s workerd; tests from `@cloudflare/vitest-pool-workers` (a real, per-test-isolated
D1); prod from the remote binding. No second driver (no `better-sqlite3`, no libSQL) exists to
drift from prod. `createDb(binding)` (`src/server/db/client.ts`) is the single constructor; the
binding is passed in, never reached for, so `server/` declares its D1 dependency and the caller
supplies it.

**Authoring ≠ application.** `drizzle-kit generate` **authors** plain-SQL migrations into
`drizzle/migrations`; `wrangler d1 migrations apply` **applies** them (`--local` for dev/test,
`--remote` for prod). Drizzle never touches the database at runtime-of-deploy; wrangler never
authors SQL. Migration artifacts stay plain SQL a human can read — the schema migration (0000)
is drizzle-generated, the fixture seed (0001) is a `--custom` migration so drizzle's journal keeps
numbering consistent for the next `generate`.

**A real-D1 test seam as a separate vitest project.** `src/server/db/**` tests run on
`@cloudflare/vitest-pool-workers` against a real migrated D1 (`vitest.workers.config.ts`); the
pure engines and stores stay on the fast node pool (`vitest.node.config.ts`). The two are wired as
vitest `projects` so a schema test never slows the whole suite to workerd boot time, and a
pure-engine test can never depend on a binding. The workers pool reads bindings from `wrangler.jsonc`
so the test D1 is configured exactly like dev and prod, and `readD1Migrations` + `applyD1Migrations`
apply the same plain SQL wrangler would.

**Seed in two layers.** The fixture numbers ship as an idempotent data migration (0001). Ongoing
drift is closed by a **deploy seed-sync** (`src/server/db/seed.ts` → `buildSeedSyncSql`): an
idempotent `INSERT … ON CONFLICT DO NOTHING` of `on_hand = 0` for every code-defined Blank, run on
every deploy (`db:seed-sync:remote`, wired into `deploy`). Adding a Blank in `src/libs/blank.ts`
therefore reaches D1 automatically; a Blank with real stock is never overwritten. The seed-sync is
plain SQL (it runs at deploy through `wrangler d1 execute`, outside any Worker, with no binding to
hand a Drizzle client) generated from the same `buildSeedSyncSql` a test applies to a real migrated
D1 — one source of truth, verified end to end.

**`on_hand >= 0` is a table CHECK.** The non-negative floor lives in the schema, not just in
later reservation code (#34/#35): over-selling can never be *persisted*, whatever a caller computes.

**EU region (`weur`), pinned at creation.** `wrangler d1 create joyofcreativity --location weur`.
There is no region field on the binding, so it is documented here and in CONTEXT.md, not in
`wrangler.jsonc`. EU storage keeps GDPR third-country transfer and Bokföringslagen abroad-storage
a non-issue.

## Consequences

- Every later table follows this shape: add it to `src/server/db/schema.ts`, `npm run db:generate`,
  commit the plain SQL, `db:migrate:local` to develop, and it ships via the `deploy` script.
- `db:studio` talks to remote D1 over `d1-http` using `CLOUDFLARE_ACCOUNT_ID` /
  `CLOUDFLARE_DATABASE_ID` / `CLOUDFLARE_D1_TOKEN` from the environment (generation stays offline
  and needs none of them).
- The seed-sync runs `node --experimental-strip-types scripts/seed-sync.ts` — no build step and no
  extra dependency, relying only on the type-only imports of `blank.ts`/`seed.ts`.
- `database_id` in `wrangler.jsonc` is a placeholder until `wrangler d1 create` is run; deploy will
  fail loudly against the placeholder rather than silently writing nowhere.

## Rejected alternatives

- **A node-side driver (better-sqlite3 / libSQL) for tests** — rejected: it would test against a
  different engine than prod. The workers pool gives a real D1 with per-test isolation for free.
- **Drizzle `push` / `migrate` applying schema at runtime** — rejected: wrangler owns application
  so migrations are the same plain SQL in dev, test, and prod, tracked in D1's own `d1_migrations`.
- **Seeding fixtures via the seed-sync alone** — rejected: seed-sync only ever writes `0`, so the
  real fixture numbers need their own data migration (0001); seed-sync is strictly the drift guard.
- **One vitest pool for everything (workers)** — rejected: it would pay workerd boot cost on every
  pure-engine test and blur the "engines do no I/O" line the codebase draws.
