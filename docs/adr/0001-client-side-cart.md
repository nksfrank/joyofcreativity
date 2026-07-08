# 1. Client-side cart (nanostores + localStorage)

Status: Accepted

## Context

Product pages are statically generated (`getStaticPaths`) and deployed on Cloudflare Workers.
There is no cart concept yet. The target journey adds a configured item, navigates to a separate
Checkout page, and expects the line to still be there — so cart state must survive a full page load.

## Decision

The cart lives **client-side** as a persistent nanostore backed by `localStorage`, hydrated into
Astro islands. No backend is required for the cart itself. The cart is per-device.

Authoritative stock and price are **re-validated server-side at checkout**, not held while items
sit in the cart.

## Consequences

- Fastest path to a working configurator + cart; no session/DB layer needed for the MVP.
- The cart cannot place stock holds; overselling is possible between add and checkout and must be
  resolved (with a clear message) at checkout. See ADR-0004.
- Cart does not follow the customer across devices. Revisit if accounts/server orders are added
  (would likely promote to a server session or D1 — see the rejected options below).
- The pricing/availability engines must be safe to run in the browser (they are pure) — see ADR-0003.

## Rejected alternatives

- **Server session (cookie + KV)** — enables cross-device carts and real stock holds, but adds an
  Astro actions/API + KV layer before we have a working flow.
- **D1 database** — most durable, needed eventually for orders, but the heaviest lift for an MVP.
