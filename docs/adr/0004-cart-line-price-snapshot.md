# 4. Cart lines snapshot the price at add-time

Status: Superseded by ADR-0016 — the stored snapshot is now the server-validated price, locked by a
signed quote. The snapshot shape and stable-display rationale below still hold; only its *source*
changed from browser-computed to server-authoritative, and reconciliation moved earlier (add-time)
rather than only at checkout.

## Context

A cart line must display a price. Prices (via modifiers) and stock can change while an item sits
in the cart. The target journey asserts the cart line's price exactly equals the price shown in
the configurator at add-time.

## Decision

When an item is added, store the **computed `Price` on the cart line** as a snapshot, alongside
the configuration. The cart renders the snapshot; it does not recompute.

At **checkout**, re-run pricing and availability server-side against current data. If the price
changed or stock is insufficient, surface it explicitly before the customer commits.

## Consequences

- Cart-line price is stable and matches what the customer saw — satisfies the fixme assertion.
- A cart line is self-describing: `{ productId, item: ProductOrderItem, price: Price, quantity }`.
- We accept possible drift between snapshot and reality; checkout is the reconciliation point.

## Rejected alternative

- **Recompute at render** — always current, but the displayed price can change silently between
  add and checkout, and the exact-match test assertion becomes fragile.
