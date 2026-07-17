# 13. Server surface: single Astro app, hybrid-static, Actions as the RPC surface, one-way import boundary

Status: Accepted

## Context

The storefront (`src/libs/` pure engines + client-side cart, ADR-0001/0003) has no server it
controls — no way to persist an order or trust a price. The transact+fulfil foundation spec
(#54, map #28) needs a server surface before D1 persistence, Stripe, or checkout can be built.
This ADR covers only the surface itself — how the app runs, how islands reach the server, and
how the isomorphic core is protected from server-only code leaking in. D1, Stripe, and the
checkout handoff are separate, later decisions.

The installed `@astrojs/cloudflare` is `14.1.1` on Astro `7.0.6`. This matters: it is built on
`@cloudflare/vite-plugin`, not the older `wrangler.getPlatformProxy()` approach. `Astro.locals.runtime`
was removed as of adapter v13 / Astro 6 — a fact the originating spec (#54) and ticket (#57) got
wrong, having been written against an older API. `astro dev` now runs directly on `workerd` via
the Vite plugin, so bindings declared in `wrangler.jsonc` are available with no separate
opt-in config.

## Decision

**One deployable.** The storefront and all server code ship as a single Astro app on the
`@astrojs/cloudflare` adapter — one deploy, one secrets store, no CORS. A separate API Worker
was rejected: independent scaling isn't needed, and it would cost a second deploy pipeline plus
a shared-types boundary for no benefit at this scale.

**Stay `output: "static"`; on-demand rendering is an explicit per-route opt-in.** Catalog pages
stay prerendered/edge-cached. A route declares `export const prerender = false` to become
dynamic — a forgotten flag fails safe (stays static) rather than silently going dynamic.

**Islands reach the server through typed Astro Actions** (zod input schemas). Confirmed against
Astro's own docs: a client-side `actions.foo()` RPC call does **not** require the calling page to
disable prerendering — only the HTML `<form action={...}>` progressive-enhancement path does.
So a prerendered page can still call an Action from a hydrated island. The later Stripe webhook
is the one exception to "Actions for everything": it must be a raw-body API route
(`prerender = false`, reading `request.text()`), because signature verification needs the
unparsed body — not something an Action's JSON-decoding surface can give it.

**Bindings via `import { env } from "cloudflare:workers"`** — never `process.env`/`import.meta.env`,
and never `Astro.locals.runtime.env` (removed, doesn't exist on the installed version).
`env` is typed as `Cloudflare.Env`, generated into the already-committed `worker-configuration.d.ts`
by the existing `cf-typegen` (`wrangler types`) script — so a binding declared in `wrangler.jsonc`
is fully typed with no `astro:env` schema ceremony. `cf-typegen` is now wired into
`predev`/`prebuild`/`pretest` (mirroring the existing `i18n` hook pattern) so the generated types
can never drift from `wrangler.jsonc`.

**Code layout + one-way import rule:**
- `src/libs/` — isomorphic domain core (engines + product/blank model), unchanged.
- `src/server/` — server-only (the real logic: D1 repos, Stripe client, order writes, later).
- `src/actions/` — the island-facing RPC surface; thin — validates input, calls into `server/`.
- `src/stores/`, `src/utils/` — unchanged.
- **Rule:** `server/`, `actions/`, `components/`, `stores/`, and pages may import *from* `libs/`;
  `libs/` may import from none of them (may use `utils/`).

**Enforcement: Biome `noRestrictedImports`, not a new tool.** A `biome.json` override scoped to
`src/libs/**` bans import patterns matching `@/server/*`, `@/actions/*`, `@/components/*`,
`@/stores/*` (and their relative forms). Runs inside the existing `npm run check` gate — no new
dependency, no new CI step. A dedicated tool (e.g. dependency-cruiser) was rejected as more
machinery than one directional rule needs. (This rule is widened further in ADR-0014 to also
protect the client bundle from `server/`'s Effect-driven cost.)

## Consequences

- A `libs/ → server/` (or `→ actions/`, `→ components/`, `→ stores/`) import fails `npm run check`
  immediately, with a Biome error pointing at the offending import — not a runtime surprise.
- Every later ticket that adds a binding (D1, Stripe secret) follows the same shape: declare it
  in `wrangler.jsonc`, run `cf-typegen` (automatic via the npm hooks), read it via `cloudflare:workers`
  in `src/server/`.
- The Stripe webhook (deferred) is the one designed exception to "everything is an Action" —
  documented here so it isn't mistaken for an inconsistency later.
- `src/actions/` accumulating real business logic instead of staying thin would be a smell — the
  point of the split is that `server/` holds the logic and `actions/` is just the validated
  entry point.

## Rejected alternatives

- **Separate API Worker** — rejected: no independent-scaling need, and it would need a
  shared-types boundary and a second deploy pipeline.
- **`output: "server"`** — rejected: wrong default for a mostly-static catalog site; would lose
  edge-caching on pages that don't need to be dynamic.
- **Typed `astro:env/server`** — rejected for now: the `cloudflare:workers` `env` import already
  gets full type safety for free via the existing `cf-typegen` script; the schema-declaration
  layer `astro:env` adds is unneeded ceremony until/unless a binding needs validation beyond
  "does the type check."
- **Dependency-cruiser (or similar) for the import boundary** — rejected: Biome's
  `noRestrictedImports` already does this inside a gate the repo runs on every check; a
  dedicated graph-analysis tool would be a new dependency for one rule.
