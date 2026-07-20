# 14. Effect.ts for the server layer

Status: Accepted

## Context

ADR-0013 establishes the server surface: `src/server/` for server-only logic, `src/actions/`
as the thin, island-facing RPC layer, both reachable only inside the Cloudflare Worker (never
the client bundle). That ADR left open *how* code inside that surface is written — plain
async/await with thrown errors, or a structured effect system.

A throwaway spike (2026-07-17, `scratchpad/effect-cf-spike/`, not committed — see the
`effect-ts-server-layer-eval` memory) tested Effect on Cloudflare Workers via a `wrangler`
dry-run against a KV-backed endpoint: it runs cleanly with no adapter and no `nodejs_compat`
reliance (esbuild produced zero node-builtin warnings). Measured gzip cost: plain TS ~0.4 KiB,
Effect core ~110 KiB, Effect core + `effect/Schema` ~129 KiB. The ~110 KiB is a **fixed,
all-or-nothing cost per Worker** — importing Effect anywhere in the server bundle pays it once;
it does not scale with how much of Effect is actually used.

## Decision

**Adopt Effect for the server layer, starting with this foundation ticket** (#57) — the trivial
demo Action's `src/server/` logic is written as a real `Effect.gen` program with a
`Context.Tag` for the Cloudflare env binding, not a placeholder. A foundation ticket's job is to
prove the shape every later ticket follows; a plain-TS demo would leave the Effect pattern
unverified until real service-layer work (D1, Stripe) starts, which is the wrong point to
discover it doesn't fit.

**Layers are built per-invocation from `cloudflare:workers`' `env`**, inside the function that
handles the request (the Action handler or the server function it calls) — never memoized at
module scope. `env` is read fresh each call and provided via `Layer.succeed(EnvTag, env)` /
`Effect.provide`, then run with `Effect.runPromise`. This is the pattern every later binding
(D1, the quote-signing key, Stripe) will follow.

**`effect/Schema` replaces zod as the real validation story everywhere except one line.**
Astro's `defineAction({ input })` is hard-typed to Zod's own internal schema type in the
installed Astro version (`node_modules/astro/dist/actions/runtime/server.d.ts`:
`TInputSchema extends z.$ZodType`) — not a generic Standard Schema interface, so an
`effect/Schema` object cannot be passed there directly. Rather than keep `zod` as a real
dependency for this, **`zod` is removed from `package.json` entirely** and the one boundary
line imports `{ z }` from `astro/zod` (which re-exports `zod/v4` — exactly what Astro's own
type constraint expects). That one line exists purely to satisfy Astro's types; every other
schema in the codebase — internal server/ validation, output shapes, the env binding's shape —
is `effect/Schema`.

**`src/actions/` imports `effect` directly — not walled off from it.** The alternative
(actions/ stays a plain-async boundary, with `Effect.runPromise` hidden inside `server/`) was
considered and rejected: exposing Effect at the RPC boundary makes cross-cutting policies
(retry, timeout, rate-limiting) trivial to apply uniformly to every action later, and since
Actions execute exclusively server-side (the client only ever imports the generated
`astro:actions` RPC stub, never the handler module itself), this costs nothing extra in the
client bundle — the ~110 KiB is already paid the moment anything in the Worker imports
`effect`, `server/` or `actions/` alike.

**The one-way import rule (ADR-0013) is widened** to mechanically protect the bundle-cost
guarantee: a second Biome `noRestrictedImports` override, scoped to `src/components/**`,
`src/stores/**`, and `src/pages/**`, bans `@/server/*` and `@/actions/*` import patterns.
Client-side code may only reach the server via the `astro:actions` virtual module (exempt,
since it isn't a `@/...` path) — never by importing `src/actions/` or `src/server/` directly.
Without this, a single stray direct import from a component would silently drag Effect's fixed
cost into the client bundle, undetected until someone inspects the build output.

## Consequences

- Every future server/ file (D1 repos, Stripe client, price-quote signing) is written in
  Effect from the start — no later "should we introduce Effect now" conversation, and no mixed
  plain-async/Effect style to reconcile.
- `zod` the dependency is gone; `effect` (with `effect/Schema`) is the only schema library in
  the codebase, except the one Astro-forced `astro/zod` import line.
- The Biome import-boundary rule now has two scopes: `src/libs/**` (protects the isomorphic
  core, ADR-0013) and `src/components/**`/`src/stores/**`/`src/pages/**` (protects the client
  bundle from the server's bundle cost). Both fail `npm run check` on violation.
- A future contributor adding a KV/D1-backed feature should reach for `Layer`/`Context.Tag`
  and `effect/Schema` by default, not ask whether to.

## Rejected alternatives

- **Plain async/await + thrown errors for server/** — rejected: no structured error channel,
  no built-in retry/timeout/concurrency primitives, and the spike showed Effect fits cleanly on
  Workers with no adapter cost beyond the fixed bundle size — there was no technical blocker to
  defer for.
- **Keep Effect contained to `server/`, actions/ stays plain-async** — rejected: would hide
  Effect's cross-cutting policies (retry/timeout/rate-limit) from the one place — the RPC
  boundary — where they'd be applied uniformly across every action; the bundle cost is paid
  either way once anything in the Worker imports `effect`.
- **Keep zod as the real validator, effect/Schema only for what Astro doesn't touch** —
  rejected: would leave two schema libraries doing the same job long-term; the one place Zod
  is unavoidable (`defineAction`'s type constraint) can be satisfied with `astro/zod` alone,
  needing no dependency of our own.
- **Deferring Effect until real service-layer work (D1/Stripe)** — the original spike verdict
  (memory, superseded by this ADR) — rejected now that this foundation ticket is the first
  server/ code being written at all; establishing the pattern here is cheaper than migrating
  later.

## Update (2026-07-20)

The decision stands; two things this ADR set up have now run their course.

- **The `greet` demo and its `ServerEnv` tag are retired.** They existed only to prove the
  pattern before real server/ code existed (§Decision). The checkout, stock, and orders
  programs now demonstrate every primitive — `Effect.gen`, `Context.Tag`, `Layer`,
  `effect/Schema`, and the typed error channel — so the demo was dead scaffolding and was
  deleted along with its `ServerCheck` island, the `/dev/server-check` route, its e2e spec, and
  the `SERVER_SURFACE_GREETING` binding.
- **The cross-cutting-policy home this ADR promised now exists.** The rationale for exposing
  Effect at the RPC boundary ("cross-cutting policies … trivial to apply uniformly to every
  action") was unrealised while each Action hand-rolled the same `runPromiseExit` → `Exit`
  unwrap → `Cause.failureOption` → `ActionError` translation. That ceremony now lives once in
  `src/actions/run-action.ts` (`runAction`): each Action passes its program, its per-invocation
  layer, and a small typed-error → `ActionError` translator. A retry/timeout/rate-limit policy
  is added there once, not in every handler.
