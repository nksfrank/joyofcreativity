# 18. Server-only API routes under `src/pages/api/` may import from `src/server/`

Status: Accepted — refines ADR-0013/0014

## Context

The Stripe webhook (#66, spec #54) is the one endpoint ADR-0013 already named as the exception to
"Actions for everything": it must be a raw-body API route (`prerender = false`, reading
`request.text()`), because signature verification needs the exact unparsed bytes Stripe signed —
something an Astro Action's JSON-decoding surface cannot give.

That route has to reach the Stripe adapter port and the verification handler in `src/server/`. But
ADR-0014's enforcement — a Biome `noRestrictedImports` override scoped to `src/components/**`,
`src/stores/**`, and `src/pages/**` — bans importing `@/server/*` and `@/actions/*` from client-
shipped code, so Effect's fixed bundle cost never reaches the browser. `src/pages/**` was included
because page components *are* shipped to the client. An API route file, however, is not: in Astro it
exports request handlers that run only on the server and produce a `Response` — it is never hydrated
and never bundled into the client.

So the rule, as written, blocked a legitimately server-only route from importing server code, on a
rationale (client bundle bloat) that does not apply to it.

## Decision

**API routes under `src/pages/api/` are server-only and exempt from the client-shipped import ban.**
The Biome override that bans `@/server/*` / `@/actions/*` imports from `src/pages/**` now carries a
`!**/src/pages/api/**` negation, so files under `src/pages/api/` may import from `src/server/` while
every other page stays fenced off. The convention is: **if a route needs server-only imports, it
lives under `src/pages/api/`** — the directory name is the signal that the file is a server endpoint,
not a shipped page.

The rest of the boundary is unchanged. The `src/libs/**` core still cannot import `server/`,
`actions/`, or the Stripe SDK. Page components outside `api/` still route server calls through
`astro:actions`. The webhook route itself stays razor-thin — it reads the two Stripe secrets from
`import { env } from "cloudflare:workers"` and delegates to `handleStripeWebhook` in `src/server/`,
which owns the raw-body read, signature verification, and the 200/400 mapping, and so is unit-
testable under plain Vitest with no `cloudflare:workers` import in the test path.

## Consequences

- The webhook route (and any future server-only endpoint) can depend on `src/server/` without
  defeating the bundle boundary, because these files are never client-shipped.
- The boundary is now directory-driven: `src/pages/api/` = server endpoint, everything else under
  `src/pages/` = shipped page held to the Actions-only rule. A page that reaches for `@/server/*`
  still fails `npm run check`, which is the intended smell.
- A file placed under `src/pages/api/` that *is* somehow client-referenced would escape the ban; this
  is accepted because API routes are server handlers by construction in Astro.

## Rejected alternatives

- **Inline the handler in the route** — rejected: it would drag `cloudflare:workers` into the only
  module holding the 200/400 logic, making the acceptance behaviour untestable without the Workers
  pool, for no gain.
- **A per-file `biome-ignore` on the webhook route** — rejected: it hides a structural fact (API
  routes are server-only) behind a line-level suppression that every future API route would have to
  re-copy. A directory-scoped exemption states the rule once.
