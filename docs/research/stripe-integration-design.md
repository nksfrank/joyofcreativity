# Stripe Integration Design

Research doc for the Sweden-first, EU-roadmap storefront selling **configurable hand-knit
products with no catalog SKU**. Every claim below is followed back to an official Stripe (or
Astro/Cloudflare) doc page. Secondary write-ups were not used as evidence.

**Sources accessed:** 2026-07-10. Stripe docs change without notice; re-verify before implementing.
Full URL list in [Sources](#sources).

---

## Summary & recommendation

**Recommendation: use Stripe Checkout (Checkout Sessions API), in _embedded_ UI mode, with
dynamic payment methods.** It is the thinnest, most boring, lowest-lock-in option that also
satisfies every standing constraint:

- **No subscription cost.** Stripe Checkout has no monthly fee; it runs on standard
  per-transaction pricing (usage-based). Nothing here requires a paid plan tier.
- **Thin server surface.** One server call — `stripe.checkout.sessions.create(...)` — plus one
  raw-body webhook route. No PaymentIntent lifecycle, no client-side confirmation logic, no
  per-payment-method code. This maps cleanly onto **one Astro Action** (create session) + **one
  Astro API route** (webhook).
- **Low lock-in / migration-friendly.** Checkout Sessions is Stripe's highest-level,
  best-supported primitive; a future migration to an off-the-shelf commerce platform discards a
  single session-create call and a webhook handler rather than a bespoke embedded-payment state
  machine.
- **Cloudflare Workers-safe.** The only runtime-sensitive piece is webhook signature verification,
  which must use the **async** verifier (`constructEventAsync`) because Workers uses Web Crypto
  (SubtleCrypto), not Node crypto. See [§5](#5-webhooks--confirmation).
- **Sweden payment methods for free.** Swish and Klarna are both enabled from the **Dashboard**
  via dynamic payment methods — no code per method — and both are supported by Checkout.

Embedded vs hosted is a low-stakes toggle (`ui_mode`), so start embedded for brand continuity and
fall back to hosted if the embed causes trouble; the server code is identical.

**Payment Element is _not_ recommended here.** It is a more powerful, lower-level, embedded UI
that buys customization we don't need at the cost of more client code and a client-side
confirmation flow — weight the store doesn't want to carry or migrate. See
[§1](#1-checkout-hosted-vs-embedded-vs-payment-element) and [Recommendation](#recommendation-checkout-vs-payment-element-for-this-store).

**What would change the recommendation:** a hard requirement for a fully custom, single-page,
multi-step embedded payment UI (Checkout's embedded form is styleable but not arbitrary), or a
need to reuse a saved payment method / build recurring billing — both push toward Payment Element
+ PaymentIntents. Neither is in scope today.

---

## 1. Checkout (hosted) vs Checkout (embedded) vs Payment Element

All three are driven by the same server object family, but differ in where the payment UI lives
and how much client code you own. Stripe documents Checkout as a **low-code** integration where
your server creates a `Checkout Session` and Stripe renders the payment UI.
([How Checkout works](https://docs.stripe.com/payments/checkout/how-checkout-works?payment-ui=stripe-hosted), accessed 2026-07-10)

### A. Checkout — Stripe-hosted page (redirect)

- Server creates a session: `stripe.checkout.sessions.create({ mode: 'payment', line_items,
  success_url })` with `ui_mode: 'hosted'` (default). The session returns a **URL**; you redirect
  the customer to Stripe's hosted page and they return to `success_url`.
  ([How Checkout works — hosted](https://docs.stripe.com/payments/checkout/how-checkout-works?payment-ui=stripe-hosted), accessed 2026-07-10)
- **PCI:** Stripe hosts all card fields, so you qualify for the simplest self-assessment,
  **SAQ A**. You never touch raw card data. **SCA / 3D Secure is handled automatically** with no
  extra code. (same page)
- **Client code:** essentially none — create session server-side, redirect, listen for webhooks.
  (same page)

### B. Checkout — embedded (form/page)

- Same server call, but set **`ui_mode: 'embedded'`**. The session then returns a
  **`client_secret`** instead of a redirect URL, and you use **`return_url`** instead of
  `success_url`. Stripe.js mounts the checkout form directly in your page and the **customer stays
  on your site** end to end.
  ([How Checkout works — embedded](https://docs.stripe.com/payments/checkout/how-checkout-works?payment-ui=embedded-form), accessed 2026-07-10)
- PCI/SCA are identical to hosted (Stripe renders the fields inside its own iframe).
- **Client code:** a small mount step (`stripe.initEmbeddedCheckout({ clientSecret })` /
  the embedded-checkout mount) — more than hosted, far less than Payment Element. The server code
  is unchanged from hosted apart from `ui_mode`/`return_url`.

Hosted vs embedded is officially framed as two prebuilt payment pages differing only in whether
the customer is redirected or stays on your site.
([Stripe support: embedded vs hosted](https://support.stripe.com/questions/embedded-checkout-vs-stripe-hosted-checkout), accessed 2026-07-10)

### C. Payment Element (embedded, lower-level)

- A **single embeddable iframe UI component** that dynamically shows 100+ payment methods based on
  the customer's location, currency, and amount, with tabs/accordion layouts. It is composable
  with the Address Element, etc.
  ([Payment Element](https://docs.stripe.com/payments/payment-element), accessed 2026-07-10)
- **Server code:** Stripe now recommends driving Payment Element with the **Checkout Sessions
  API** (returns a `client_secret`) rather than PaymentIntents — the PaymentIntents path
  "requires significantly more code" (you build tax, discounts, shipping, currency conversion
  yourself). Either way the backend returns a `client_secret` to the client. (same page)
- **Client code:** you own the mount **and** the confirmation call — e.g.
  `stripe.elements({ clientSecret })` → `elements.create('payment')` →
  `paymentElement.mount('#payment-element')`, then confirm on submit. This is the biggest surface
  difference vs Checkout. (same page)
- **PCI:** iframe-based, so card data never touches your app (SAQ A-eligible). SCA/3DS is handled
  in the confirmation flow. (same page)

### How they map to this store

| | Server code | Client code | Redirect? | PCI | Best when |
|---|---|---|---|---|---|
| Checkout hosted | 1 session create | ~none | yes | SAQ A | absolute minimum surface |
| Checkout embedded | 1 session create + `ui_mode` | small mount | no | SAQ A | stay on-site, still thin |
| Payment Element | session create (or PaymentIntent) | mount **+ confirm** | no | SAQ A | need custom multi-element UI / saved cards / recurring |

For a thin, boring, migration-friendly store, **Checkout (embedded)** is the sweet spot: no
redirect, but the server surface stays a single session-create call.

---

## 2. Klarna + Swish for Sweden

### Swish (SEK-only, Sweden-only) — confirmed

- Swish is a **single-use, customer-initiated real-time** payment method. **Currency: SEK only.
  Customer location: Sweden only.** Business (merchant) accounts in 26 European countries may
  accept it (SE included). ([Swish payments](https://docs.stripe.com/payments/swish), accessed 2026-07-10)
- **Redirect/app-based:** on mobile it redirects to the Swish app to authorize; on desktop the
  customer scans a QR code. This means a **`next_action`** step in the payment flow. (same page)
- **Supported integrations:** Checkout (except subscription/setup mode) and Elements (except
  Express Checkout Element), plus Payment Links. **No recurring, no manual capture, no disputes.**
  (same page) → So **both Checkout and Payment Element support Swish.**

### Klarna — currencies and enablement

- **Presentment currencies include both SEK and EUR** (full list: AUD, CAD, CHF, CZK, DKK, EUR,
  GBP, NOK, NZD, PLN, RON, SEK, USD). Customer locations include Sweden and 22 other countries.
  ([Klarna payments](https://docs.stripe.com/payments/klarna), accessed 2026-07-10)
- **Supported integrations:** Checkout (hosted and embedded), Payment Links, Elements, Payment
  Intents API, Invoicing, Subscriptions, Connect. **No per-method code required** — enable in the
  Dashboard (Standard accounts). (same page) → **Both Checkout and Payment Element support Klarna.**
- **Cross-border note:** Klarna is generally restricted to the merchant's business-location
  currency, except EEA/UK/Switzerland where the customer-location currency is allowed. For a
  Sweden/EU store selling in SEK and EUR within the EEA this is fine, but verify per target
  country at build time. (same page)

### Dynamic (automatic) payment methods — enable from the Dashboard, no code per method

- **Dynamic payment methods** is part of the default Stripe integration: you configure which
  methods are on from the **Dashboard — no code required** — and Stripe decides which eligible
  methods to display per session (based on location, currency, amount).
  ([Dynamic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods), accessed 2026-07-10)
- Works with **Checkout, Payment Element, Payment Links, Hosted Invoice Page.** (same page)
- On API version 2023-08-16+, you simply **omit `payment_method_types`** and Stripe uses dynamic
  methods automatically; older versions pass **`automatic_payment_methods[enabled]=true`**. You
  can still exclude a method per-transaction via **`excluded_payment_method_types[]`**. (same page)
- **Implication for this store:** enable Swish + Klarna (+ cards) once in the Dashboard. Do **not**
  hardcode `payment_method_types`. Stripe shows Swish only to SEK/Sweden customers and hides it
  otherwise automatically, which is exactly the currency/country gating we'd otherwise have to
  write by hand.

**Redirect / next_action implication:** Swish is app/redirect-based, so the payment does not
settle synchronously in the browser. With Checkout, Stripe handles the redirect/QR `next_action`
inside its own UI, so **we write no next_action code** — we only observe the result via webhook
(see [§5](#5-webhooks--confirmation)). This is a strong reason to prefer Checkout over
hand-rolling PaymentIntents + Payment Element for a redirect-heavy market.

---

## 3. Representing a configured order item as line items in minor units

The store's order items are resolved configurations `{ blankId, patternId, yarnColorIds,
customisation }` with a computed `Price { amount, currency }` in integer minor units. There is no
SKU, so pre-created Price objects are the wrong tool.

### Inline `price_data` — confirmed, no pre-created objects needed

- For amounts that differ per transaction, Stripe explicitly says to **not create a Price** and
  instead pass **`price_data`** when creating the Checkout Session (or Payment Link/Subscription).
  ([How products and prices work](https://docs.stripe.com/products-prices/how-products-and-prices-work), accessed 2026-07-10)
- You can define the product inline with **`price_data.product_data.name`** (and optional
  `description`), **`price_data.unit_amount`**, **`price_data.currency`**, plus **`quantity`** on
  the line item. This generates a temporary `Price` (not shown in the Dashboard) and an associated
  `Product`. (same page; parameter shape confirmed in the
  [Checkout prices migration guide](https://docs.stripe.com/payments/checkout/migrating-prices), accessed 2026-07-10)

Minimal shape (illustrative, not a tutorial):

```js
line_items: [{
  quantity: 1,
  price_data: {
    currency: 'sek',                       // or 'eur'
    unit_amount: price.amount,             // integer minor units (öre / cents)
    product_data: {
      name: 'Hand-knit sweater (bespoke)',
      metadata: { blankId, patternId, yarnColorIds: yarnColorIds.join(','), configHash },
    },
  },
}]
```

### `unit_amount` semantics — smallest currency unit

- **`unit_amount` is the amount in the smallest currency unit, as a whole integer.** Examples from
  the docs: USD $10.50 → `1050`; EUR €9.99 → `999`; JPY ¥1300 → `1300` (zero-decimal).
  ([How products and prices work](https://docs.stripe.com/products-prices/how-products-and-prices-work), accessed 2026-07-10)
- **SEK and EUR are both 2-decimal**, so the store's existing `Price.amount` (öre / cents) maps
  **directly** onto `unit_amount` with no conversion. Pass `currency` as the lowercase ISO code
  (`sek` / `eur`). This matches the store's "integer minor units, never fractional major units"
  invariant — no rounding at the Stripe boundary.

### Where to stash the configuration — metadata

- Use **metadata** to attach structured key-value data to Stripe objects. You can set metadata on
  the Checkout Session and on the underlying PaymentIntent, and **`product_data.metadata`** on the
  inline product. ([Metadata](https://docs.stripe.com/metadata), accessed 2026-07-10)
- **Limits: 50 key-value pairs per object; key ≤ 40 chars; value ≤ 500 chars; string values only;
  keys cannot contain `[` or `]`.** If you need more, store the payload in your own DB and put only
  a reference ID in metadata. (same page)
- **Design note:** the full configuration can exceed these limits (e.g. many `yarnColorIds` +
  free-text `customisation`). Keep metadata to a compact reference — e.g. an internal `orderItemId`
  / `configId` — and hold the authoritative resolved configuration in your own store. This also
  keeps the surface thin and migration-friendly (Stripe holds a pointer, not your domain model).

### Tax — brief (out of scope)

- Prices/line items carry a **`tax_behavior`** (`inclusive` / `exclusive` / `unspecified`), and
  **Stripe Tax** can automate calculation. ([The Price object](https://docs.stripe.com/api/prices/object), accessed 2026-07-10)
- Tax automation is out of scope for this store. If prices are VAT-inclusive (typical for SE/EU
  consumer retail), set `tax_behavior: 'inclusive'` on `price_data` so displayed totals are honest;
  otherwise leave it unspecified. Revisit if/when Stripe Tax is adopted.

---

## 4. Test-mode setup

### Keys

- **Test vs live keys are distinguished by prefix:** test = **`sk_test_…` / `pk_test_…`**, live =
  **`sk_live_… / pk_live_…`**. Test-mode data is fully isolated (a sandbox); test transactions move
  no real funds. Store live keys in a secrets vault / env vars, never in source control.
  ([Testing](https://docs.stripe.com/testing), accessed 2026-07-10)
- On Cloudflare, read the secret key from **`Astro.locals.runtime.env`** (per the store's runtime
  convention), never from a bundled constant.

### Test cards

- **Visa success:** `4242 4242 4242 4242` (any future expiry, any CVC).
- **SCA / 3DS authentication required:** `4000 0025 0000 3155`.
- **Generic decline:** `4000 0000 0000 0002` (`card_declined` / `generic_decline`).
  ([Testing](https://docs.stripe.com/testing), accessed 2026-07-10)

### Testing Swish (no real Swish app needed)

- In test mode, choosing Swish and paying **redirects to a Stripe test payment page where you
  approve or decline** the payment. On desktop, the QR payload contains a URL to that same test
  page. No real Swish app or bank credentials are required.
  ([Accept a Swish payment](https://docs.stripe.com/payments/swish/accept-a-payment?payment-ui=elements), accessed 2026-07-10)
- The docs do **not** publish specific test phone numbers or an explicit timeout simulator for
  Swish; only approve/decline is documented. Treat timeout/expiry handling as something to verify
  empirically against the test page rather than from a documented test value.

### Testing Klarna (no real Klarna account needed)

- In test mode, select Klarna and click Pay; you then **simulate outcomes within Klarna's
  redirect**. Approval/denial is driven by the **email address** you supply (e.g.
  `customer@email.de` approves, `customer+denied@email.de` denies for DE); each supported country
  has its own test data. In-flow authentication accepts **any six-digit code**, and **`999999`
  forces auth failure**.
  ([Accept a Klarna payment](https://docs.stripe.com/payments/klarna/accept-a-payment?payment-ui=checkout), accessed 2026-07-10)

---

## 5. Webhooks + confirmation

### Which event authoritatively confirms "paid"

- The **fulfillment source of truth is the Checkout Session's `payment_status`**, not merely the
  arrival of an event. Register **`checkout.session.completed`** and, for delayed/async methods,
  **`checkout.session.async_payment_succeeded`** (and optionally
  **`checkout.session.async_payment_failed`**). On receipt, retrieve the session and fulfill only
  when **`payment_status !== 'unpaid'`** (`payment_status` values: `paid`, `unpaid`,
  `no_payment_required`).
  ([Fulfill orders](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted), accessed 2026-07-10)
- **Why `checkout.session.completed` is not sufficient alone:** for delayed-notification methods
  the session can complete while the payment is still `processing`; funds confirm later via
  **`checkout.session.async_payment_succeeded`**. So you must handle both events and gate on
  `payment_status`. (same page)
- **`checkout.session.completed` vs `payment_intent.succeeded`:** for a Checkout integration,
  prefer the **session-level** events — they carry the Checkout Session (with `payment_status`,
  line items, metadata) and are the documented fulfillment trigger. `payment_intent.succeeded`
  fires at the PaymentIntent layer and is the natural signal for a raw PaymentIntent/Payment
  Element integration; using it under Checkout means re-deriving the session context yourself.
  Sticking to session events keeps the handler thin. (Fulfill orders, same page)
- **Swish specifically:** Swish is real-time, so in practice it should resolve to
  `payment_status: 'paid'` at session completion rather than going async. This is an inference from
  Swish being documented as a real-time method; I did **not** find a primary page that explicitly
  states whether Swish emits `async_payment_succeeded`. Handling both events (as above) is correct
  regardless, so no code change hinges on resolving this.

### Verifying the signed webhook (raw body + signing secret)

- Stripe signs each webhook with the **`Stripe-Signature`** header (`t=` timestamp, `v1=`
  HMAC-SHA256 signature). Verify using the **raw request body** (unparsed), the header, and the
  endpoint **signing secret** via the SDK's `constructEvent`.
  ([Webhooks](https://docs.stripe.com/webhooks), accessed 2026-07-10)
- **Cloudflare Workers → use the async verifier.** In Web Crypto (SubtleCrypto) runtimes such as
  Cloudflare Workers and Deno, the synchronous `constructEvent` cannot work because SubtleCrypto is
  async; use **`await stripe.webhooks.constructEventAsync(payload, sigHeader, secret)`** instead.
  ([Webhooks](https://docs.stripe.com/webhooks), accessed 2026-07-10)

```js
// Astro API route (NOT an Action), prerender = false, raw body preserved:
const payload = await request.text();                 // raw, unparsed body
const sig = request.headers.get('stripe-signature');
const event = await stripe.webhooks.constructEventAsync(
  payload, sig, runtime.env.STRIPE_WEBHOOK_SECRET,    // async: required on Workers
);
```

- **Raw-body requirement:** the framework must not re-serialize or mutate the body before
  verification, or the signature check fails — hence the webhook is an **Astro API route reading
  `request.text()`**, not an Astro Action (Actions parse/validate input). (Webhooks, same page)

### Idempotency (at-least-once delivery)

- Delivery is **at-least-once and not ordered**; the same event can arrive multiple times, and
  Stripe retries for up to ~3 days with backoff. **Dedupe by `event.id`** — record processed IDs
  and skip repeats. ([Webhooks](https://docs.stripe.com/webhooks), accessed 2026-07-10)
- Additionally, make **`fulfill_checkout(session_id)` itself idempotent**: it "might be called
  multiple times, possibly concurrently, for the same Checkout Session," so record fulfillment
  status per session and no-op if already fulfilled.
  ([Fulfill orders](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted), accessed 2026-07-10)
- **Return 2xx quickly** and defer heavy work; long synchronous processing before responding risks
  timeouts and unnecessary retries. On Workers, use `ctx.waitUntil(...)` / a queue for post-ack
  work. (Webhooks, same page)

### Recommended fulfilment pattern (from the docs)

1. Register `checkout.session.completed` + `checkout.session.async_payment_succeeded`.
2. On either, call one idempotent `fulfill_checkout(sessionId)`.
3. Inside it: `stripe.checkout.sessions.retrieve(id, { expand: ['line_items'] })`, check
   `payment_status !== 'unpaid'`, then fulfill once (guarded by recorded status).
4. Optionally also trigger `fulfill_checkout` from the `success_url`/`return_url` landing page
   using the `{CHECKOUT_SESSION_ID}` placeholder — but the webhook is the required backstop,
   because customers aren't guaranteed to return to that page.
   ([Fulfill orders](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted), accessed 2026-07-10)

---

## Recommendation: Checkout vs Payment Element for THIS store

**Recommendation: Stripe Checkout via the Checkout Sessions API, `ui_mode: 'embedded'`, dynamic
payment methods enabled in the Dashboard.**

Trade-offs tied to the standing constraints:

- **No subscription / free-tier only** — met by either option; Checkout adds no plan cost.
  Neutral, but Checkout adds no incentive to reach for paid features.
- **Thin / boring / low-lock-in** — decisive for Checkout. Checkout is a single server call
  (`checkout.sessions.create`) plus a webhook; Payment Element additionally makes you own a
  client-side mount **and confirmation** flow. A migration off Stripe discards less with Checkout.
- **Cloudflare Workers + Astro Actions** — both fit (session create = one Action; webhook = one
  raw-body API route using `constructEventAsync`). But Payment Element's client confirmation and
  (if you use PaymentIntents) extra server orchestration add more Worker-side code to get right.
- **Sweden methods (Swish redirect, Klarna BNPL)** — Checkout handles the Swish redirect / QR
  `next_action` and Klarna redirect inside Stripe's own UI, so we write **no** next_action code.
  With Payment Element you're more exposed to confirmation/next_action handling. Both support both
  methods, but Checkout minimizes the redirect-handling surface.
- **Bespoke, no-SKU items** — orthogonal to the choice; solved by inline `price_data` +
  `unit_amount` in minor units + a compact metadata reference, which works identically under both.

**Embedded vs hosted:** choose **embedded** first (customer stays on-site; only `ui_mode`,
`client_secret`, `return_url` differ from hosted). If the embed integration proves fiddly on the
Astro/Cloudflare/islands setup, fall back to **hosted** — the server code is unchanged.

**What would flip this to Payment Element (+ PaymentIntents):** a hard need for a fully custom,
arbitrarily-designed single-page payment step beyond Checkout's styling; saved/re-used payment
methods for returning customers; or future recurring billing. None are in scope now — revisit if
they enter it.

---

## Sources

All accessed 2026-07-10.

- How Checkout works (hosted): https://docs.stripe.com/payments/checkout/how-checkout-works?payment-ui=stripe-hosted
- How Checkout works (embedded form): https://docs.stripe.com/payments/checkout/how-checkout-works?payment-ui=embedded-form
- Payment Element: https://docs.stripe.com/payments/payment-element
- Stripe support — embedded vs hosted Checkout: https://support.stripe.com/questions/embedded-checkout-vs-stripe-hosted-checkout
- Swish payments (overview, currency/country constraints): https://docs.stripe.com/payments/swish
- Accept a Swish payment (test mode, next_action): https://docs.stripe.com/payments/swish/accept-a-payment?payment-ui=elements
- Klarna payments (currencies, countries, integrations): https://docs.stripe.com/payments/klarna
- Accept a Klarna payment (test mode): https://docs.stripe.com/payments/klarna/accept-a-payment?payment-ui=checkout
- Dynamic payment methods: https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods
- How products and prices work (price_data, unit_amount): https://docs.stripe.com/products-prices/how-products-and-prices-work
- Checkout prices migration guide (price_data shape): https://docs.stripe.com/payments/checkout/migrating-prices
- The Price object (tax_behavior): https://docs.stripe.com/api/prices/object
- Metadata (limits): https://docs.stripe.com/metadata
- Testing (keys, test cards): https://docs.stripe.com/testing
- Fulfill orders (events, payment_status, idempotency): https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted
- Webhooks (signature verification, constructEventAsync, idempotency): https://docs.stripe.com/webhooks
