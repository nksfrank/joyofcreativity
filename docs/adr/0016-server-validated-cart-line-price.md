# 16. The cart line price is server-authoritative, locked by a signed quote

Status: Accepted — supersedes ADR-0004

## Context

ADR-0004 stored the **client-computed** price on the cart line as an add-time snapshot and deferred
the authoritative check to checkout. That is the right shape for stable display, but it left the
stored price browser-computed: a tampered island could persist any number, and checkout had nothing
to reconcile it against beyond re-running the engines.

`validateCheckout` (#64) is the first authoritative checkpoint (the add-time edge of the trust
boundary, #33). It re-prices the whole cart **server-side** with the same `PricingManager` /
`AvailabilityManager` the client runs (ADR-0003), re-validates every line against the catalog and
live D1 stock (#62), and returns all problems at once in four buckets — or, for a good cart, a
signed quote.

Because the cart is client-side with no server-side cart table (ADR-0001), the server has nothing to
re-read at commit. So instead of holding state it returns a **signed quote**: an HMAC over the priced
cart that the client carries to commit. A valid signature is the server's own attestation — there is
nothing left to re-confirm.

## Decision

- **The stored cart-line price is the server-validated price.** Add-to-cart calls `validateCheckout`
  and stores the unit price from the returned quote — never `ready.price`. The configurator still
  computes client-side for instant feedback (ADR-0003 preserved), but that number never reaches the
  cart line.

- **A signed quote is the price lock.** `validateCheckout` returns the priced cart plus an HMAC over
  `{ lines: [{ productId, item, quantity, unitPrice }], currency, issuedAt, expiresAt, quoteId }`.
  Expiry is **24h** behind a single tunable constant (`QUOTE_TTL_MS`). Within the window the locked
  price cannot change; on expiry the summary re-runs `validateCheckout` and re-quotes — the one
  moment a locked price can change on the customer (bucket 4, price drift).

- **Four-bucket validation.** Every line is checked and all problems are returned together:
  1. **Tampered / structural** — unknown product/blank/pattern, wrong yarn count, rule-violating
     customisation, a cart mixing currencies, or (at commit) an HMAC mismatch / expired quote.
  2. **Unavailable** — structurally valid, but the availability engine now fails it.
  3. **Out of stock** — valid and available, but D1 on-hand is below the quantity.
  4. **Price drift** — eliminated at commit by the lock; surfaces only on quote expiry.

- **Single-currency invariant** holds on the quote: a cart spanning currencies is a structural
  (bucket 1) problem, not a priced quote.

- **One new Workers secret** — `QUOTE_SIGNING_KEY`, the quote-signing key — set via `.dev.vars`
  locally and `wrangler secret put QUOTE_SIGNING_KEY` in production, read at the Action boundary
  (`cloudflare:workers`) and injected as the `QuoteSigner` layer (ADR-0014). No other secret is added.

## Consequences

- The stored price can no longer be forged: it is the server's own computation, and the signed quote
  attests to it end-to-end (line, config, quantity, currency, expiry all covered by the HMAC).
- Add-to-cart now costs a server round-trip. It fails closed: a problem or infra error surfaces the
  buckets and does not add a browser-priced line.
- The exact-match assertion ADR-0004 protected still holds — the configurator and the server compute
  the same number from the same engines — so the cart still shows what the customer saw.
- ADR-0001 (client-side cart) and ADR-0003 (engines run client-side) are preserved. ADR-0004 is
  superseded: the snapshot is now server-authoritative, and reconciliation moves earlier (to
  add-time) rather than living only at checkout.

## Rejected alternatives

- **Keep the client-computed snapshot (ADR-0004 as-is)** — simplest, but leaves the stored price
  forgeable and gives commit nothing but a re-run to trust.
- **A server-side cart table keyed by session** — would let the server re-read the cart at commit,
  but reintroduces the session/DB layer ADR-0001 deliberately avoided; the signed quote gets the
  same attestation with no server state.
