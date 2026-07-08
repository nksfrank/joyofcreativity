# 8. Preact + nanostores for the interactive layer

Status: Accepted

## Context

The repo ships as Astro scaffolding: `astro` + `zod`, `output: "static"`, no UI framework
integrated. The product configurator is the first genuinely interactive surface — every selection
recomputes per-option `disabled` flags (via the feasibility search in ADR-0005), the live price,
and a possible dead-end dialog, and cart state is shared between the product page and a cart
view/badge in the site layout. The framework choice was open, not dictated by the scaffolding.

## Decision

Adopt **Preact** (via `@astrojs/preact`) as the island framework and **nanostores** as the
cart store (confirming ADR-0001's mechanism), persisted to `localStorage`.

- Configurator and cart-view/badge are Preact islands, hydrated (`client:*`) on otherwise static pages.
- The cart is a nanostores atom shared across islands; a persistence binding writes it to `localStorage`.
- `ConfigurationModel`, `PricingManager`, and `AvailabilityManager` remain **pure, framework-agnostic
  TypeScript** — Preact is only the view layer and consumes the model's output.

## Consequences

- Small footprint (~4kb Preact) keeps the mostly-static site light while giving real reactivity.
- `@astrojs/preact` is added to the Astro config; JSX/TSX enters the codebase for islands only.
- Output can stay `static`; islands hydrate client-side, consistent with the client-side cart (ADR-0001)
  and client-side engines (ADR-0003).
- If the interactive surface later outgrows Preact, migrating the thin view layer is cheap because the
  logic lives in the pure modules, not the components.

## Rejected alternatives

- **Vanilla `<script>`, zero deps** — keeps the repo dependency-free, but reactive disabled-state/price
  updates are manual and error-prone for a configurator this stateful.
- **Svelte** — excellent store ergonomics, but less mainstream than the React family here.
- **React** — most familiar, but the largest bundle for a site that is otherwise static.
