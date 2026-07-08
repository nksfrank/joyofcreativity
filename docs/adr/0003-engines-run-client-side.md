# 3. The configurator runs the pure engines client-side

Status: Accepted

## Context

As the customer changes selections, the price must update and impossible options must grey out
with no perceptible latency. The pricing and availability engines are pure functions of
`(ProductDefinition, ProductOrderItem)`.

## Decision

Serialize the `ProductDefinition` into the configurator island and run `PricingManager` and
`AvailabilityManager` **in the browser**. Selection changes recompute price/availability locally
with no server round-trip.

## Consequences

- Instant feedback; no actions/API layer needed for the configurator.
- The full product definition (including per-choice price modifiers and blank stock) is exposed to
  the client. Acceptable — this is public storefront data — but it means client results are advisory.
- **Client results are never trusted for money or inventory.** Add-to-cart snapshots a
  client-computed price (ADR-0004) and checkout re-validates authoritatively server-side.
- The engines must stay pure and isomorphic; no server-only imports may leak into them.

## Rejected alternative

- **Server round-trips per interaction (Astro actions)** — single source of truth and no exposed
  definition, but adds latency to every click and an actions layer now.
