# 17. The commit boundary charges only a verified quote, never client data

Status: Accepted — refines ADR-0016

## Context

ADR-0016 made the cart-line price server-authoritative and returns a **signed quote** (HMAC) at
add-time (#64). Its consequence claimed "the stored price can no longer be forged." That is true of
the *add-time write* — but the cart lives in `localStorage` (ADR-0001), which stays editable
afterwards. A report (issue #64 follow-up) showed the gap concretely: edit the stored line price to
`1 SEK`, open the cart summary, and it renders `1 SEK` and shows "Everything checks out — ready to
pay."

Two things were true at once:

- The signed quote — the server's actual attestation — was **fetched and discarded** by the checkout
  summary; the screen kept displaying and totalling the editable `localStorage` price.
- There is **no pay/commit route yet** (that is #54 / trust boundary #33). So nothing charges `1 SEK`
  today. The danger is latent: nothing *structurally* forces the future pay route to charge from the
  signed quote rather than from the forgeable cart line.

`verifyQuote` also returned a plain `QuotePayload` on success — a shape any object literal or cart
line satisfies. Trust was not carried by the type, so protecting it could only ever be an external
rule policing who is allowed to read what.

## Decision

- **The commit/pay boundary re-derives its own authority in its own server turn.** The pay path
  obtains a server-issued quote itself (re-running `validateCheckout`, or verifying a freshly issued
  one) and charges only from that quote's `unitPrice`. It reads **no** client-supplied price — not a
  request field, not the cart line's stored `price`. A stale or edited cart can never drive a charge.
  No signed quote is stored client-side as durable truth.

- **Trust is carried by the type: a branded `VerifiedQuote`.** `verifyQuote` is the *only* mint of a
  `VerifiedQuote` — a `QuotePayload` marked with a private, phantom brand that no code outside
  `quote.ts` can name or cast into. The future pay/commit handler's signature demands a
  `VerifiedQuote` and reads price from it, so "charge a price the server never signed" is a **compile
  error**, not a policy anyone must remember. This is the guard — not a lint or import rule, which
  would drift and would nag legitimate future work.

- **The server never accepts client price data.** The decode boundary strips it: the Astro Action's
  Zod `input` and the Effect `Schema.Struct` inside `validateCheckout` both discard excess properties
  by default, so a request smuggling a `price`/`display` has no effect on the computed quote. Pinned
  by a workers-pool strip-guard test (a line carrying a forged `1 SEK` still prices server-side).

- **Display stays client-side and carries no authority.** The cart summary keeps rendering its
  `localStorage` price for instant feedback (ADR-0003, ADR-0016). A customer editing their own
  browser only misleads themselves; the displayed number never drives a charge. No display change is
  made here.

## Consequences

- The reported edit cannot cause a `1 SEK` charge: the charge is structurally derived from the
  server-signed quote, and the forged price is stripped before the server ever sees it.
- The future pay route (#54 / #33) is constrained by the compiler to consume a `VerifiedQuote`; it
  cannot accidentally trust the cart.
- ADR-0016's add-time attestation stands. This ADR corrects the scope of its "can no longer be
  forged" claim: the stored price *can* be edited locally, but it is never authoritative — it is
  display-only, and the commit boundary is where authority is (re-)established.
- ADR-0001 (client-side cart) and ADR-0003 (engines run client-side) are preserved.

## Rejected alternatives

- **A lint / import-boundary rule** forbidding server code from reading the cart's `price` — fragile:
  path globs and property patterns drift, and the rule blocks rather than guides future work. The
  branded type makes the illegal state unrepresentable instead.
- **Persist the signed quote in client state as the carried truth** — invites treating `localStorage`
  as authoritative and needs fragile invalidation on every cart mutation; re-deriving at pay time
  needs no client storage.
- **Compare the client price to the server price and warn on drift** — contradicts the trust-minimal
  design; the server is authoritative and does not care what the client claimed.
- **Overwrite the checkout display with the quote price** — cosmetic (the display carries no
  authority) and risks implying the display is the source of truth; out of scope here.
