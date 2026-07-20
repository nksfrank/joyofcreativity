# 19. Stripe behind a thin adapter port, faked for tests

Status: Accepted

## Context

The transact+fulfil foundation (#54, Stripe design #31) needs Stripe reachable from two
future consumers — the checkout-session Action and, later, the raw-body webhook route. Before
either is built, issue #61 stands up the shared client foundation: the SDK, the wiring for its
test-mode secret, and the seam that keeps Stripe out of the browser bundle and out of the CI
test path. ADR-0013 already put all server-only code in `src/server/` behind a one-way import
rule; ADR-0014 made `src/server/` an Effect layer with `Context.Tag` services provided
per-invocation from `cloudflare:workers`' `env`. This ADR decides how Stripe fits that shape.

The `stripe` SDK is a heavy, server-only dependency that reads a live secret key. Calling it
directly from feature code would scatter SDK types through the codebase, make server units
untestable without a network (or a mated Stripe test account) in CI, and risk the SDK — or the
secret — drifting toward the client bundle.

## Decision

**Stripe is reached only through a thin adapter port** — `Stripe`, a `Context.Tag` service in
`src/server/stripe.ts` exposing a couple of domain-shaped operations (starting with
`createCheckoutSession`), never the SDK. Callers depend on the port; the SDK type surface stops
at this one module. The port's request/response types speak the shop's language (minor-units
money per CONTEXT.md, `sek`/`eur`), not Stripe's.

**The live layer is a factory built per-invocation from the test-mode secret** — `layer(secretKey)`
returns `Layer.succeed(Stripe, …)` over an SDK client, matching ADR-0014's rule that layers are
constructed inside the request handler from `env` (`import { env } from "cloudflare:workers"`),
never memoised at module scope. The SDK is instantiated with `Stripe.createFetchHttpClient()` so
it runs on `workerd` with no Node HTTP APIs. The key (`sk_test_…`) is a **secret**, so it lives
in `.dev.vars` for local dev (documented in `.dev.vars.example`) and a `wrangler secret` in
production — not in `wrangler.jsonc`'s committed `vars`. The one `cloudflare:workers` read is
isolated in `src/server/stripe.env.ts` (`layerFromEnv()`, a one-liner over `layer`), so the pure
port module stays runnable under plain Vitest and the virtual module never enters the test path —
mirroring how `src/actions/` is the env boundary and `src/server/greeting.ts` stays pure. Because
the secret isn't a committed `var`, `cf-typegen` won't type it; `stripe.env.d.ts` interface-merges
`STRIPE_SECRET_KEY` onto `Cloudflare.Env` so the binding is typed without the generated types
drifting on whether a local `.dev.vars` existed at type-gen time.

**A faked port ships for tests** — `makeFakeStripe()` returns a `Stripe` layer that records every
call and returns a canned session (or a canned typed `StripeError`), so an integration test can
exercise a port method with **no external call in CI**. This reuses the repo's existing plain-Vitest
+ Effect-layer test style (as `src/server/greeting.test.ts` does); `@cloudflare/vitest-pool-workers`
— named in the originating ticket — was not adopted, because the port's only runtime dependency
is the injected layer, so a Workers pool buys nothing here and would add test infrastructure the
rest of the suite doesn't use. If a later server unit genuinely needs real bindings (D1) under
test, the pool can be introduced then, for those tests.

**The one-way import rule is extended to the SDK itself** — the `src/libs/**` Biome
`noRestrictedImports` override (ADR-0013) already bans `@/server/*`; it now also bans `stripe`
directly, so the isomorphic core cannot import the port *or* the SDK. Both fail `npm run check`.

## Consequences

- Server features (the checkout Action next) depend on `Stripe` and are unit-testable against
  `makeFakeStripe()` with zero network; the real SDK is exercised only in `wrangler dev` / against
  Stripe's test mode, never in CI.
- Adding an operation the webhook route needs (e.g. verifying a signed event) means extending the
  `StripeService` interface and both implementations — the port stays the single seam.
- The Stripe secret follows the established secret path (`.dev.vars` + `wrangler secret`), distinct
  from the committed `vars` used for non-secret config like `SERVER_SURFACE_GREETING`.

## Rejected alternatives

- **Call the SDK directly from feature code** — rejected: spreads SDK types, makes server units
  need a network in CI, and weakens the bundle/secret boundary the whole server surface rests on.
- **`@cloudflare/vitest-pool-workers` for the port's tests** — rejected for now: the port is
  exercised entirely through an injected layer, so a Workers pool adds infrastructure without
  removing any external dependency from the test. Revisit when a server unit needs real bindings.
- **Keep the Stripe secret in `wrangler.jsonc` `vars`** — rejected: `vars` is committed; a live
  secret belongs in `.dev.vars`/`wrangler secret`.
