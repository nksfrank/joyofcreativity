import { Context, Data, Effect, Layer } from "effect";
import StripeSdk from "stripe";
import type { Price } from "@/libs/money";

/**
 * Stripe adapter port (issue #61, ADR-0013/0014).
 *
 * The rest of the server layer talks to Stripe through this interface — never
 * the SDK directly — so callers depend on a couple of domain-shaped operations
 * and tests can substitute a fake with no network. The SDK is instantiated
 * server-side only (ADR-0013): this module lives in `src/server/`, and the
 * one-way import rule keeps it out of `src/libs/` and the client bundle.
 *
 * Provided as an Effect service via {@link Stripe}. The real implementation is
 * built per-invocation from the test-mode secret read out of
 * `import { env } from "cloudflare:workers"` (ADR-0014) — see {@link layer}.
 */

/** One line of an embedded Checkout Session. */
export interface CheckoutLineItem {
  /** Human-readable product name Stripe shows on the payment page. */
  readonly name: string;
  /** Per-unit price — the domain `Price` (minor units + currency, CONTEXT.md). */
  readonly price: Price;
  /** Number of this line ordered. */
  readonly quantity: number;
}

/** The request to open an embedded Stripe Checkout Session. */
export interface CreateCheckoutSession {
  readonly lineItems: readonly CheckoutLineItem[];
  /** Where Stripe returns the buyer after the embedded flow completes. */
  readonly returnUrl: string;
  /**
   * Compact reference data stamped on the Session (#65). Stripe holds only a
   * pointer — the order's public id — never the domain model; the authoritative
   * configuration lives in our D1. Values are string-only and capped at 500 chars
   * per Stripe's metadata limits, which a UUIDv7 reference is far under.
   */
  readonly metadata?: Readonly<Record<string, string>>;
}

/** What a caller needs back to mount Stripe's embedded checkout client-side. */
export interface CheckoutSession {
  readonly id: string;
  readonly clientSecret: string;
}

/**
 * A raw webhook delivery, as it arrives at the endpoint (issue #66): the
 * unparsed request body, the `Stripe-Signature` header value, and the webhook
 * signing secret to verify against. The `payload` is the raw `request.text()` —
 * verification must run against the exact bytes Stripe signed, not a re-serialised
 * JSON, so this never speaks a parsed shape.
 */
export interface WebhookDelivery {
  readonly payload: string;
  /** The `Stripe-Signature` header value; may be absent, which fails verification. */
  readonly signature: string | null;
  /** The webhook signing secret (`whsec_…`), read per-invocation from `env`. */
  readonly secret: string;
}

/**
 * A verified webhook event, reduced to the domain-shaped fields a consumer
 * branches on. Kept minimal on purpose (issue #66 only verifies and no-ops);
 * the reconciliation logic in #35 widens this as it starts to read event data.
 */
export interface WebhookEvent {
  readonly id: string;
  readonly type: string;
}

/**
 * The typed failure channel for every port operation. Any SDK rejection or a
 * malformed Stripe response is normalised into this so callers translate one
 * error shape, never the SDK's throw surface.
 */
export class StripeError extends Data.TaggedError("StripeError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** The operations this effort needs from Stripe. Kept thin on purpose. */
export interface StripeService {
  readonly createCheckoutSession: (
    params: CreateCheckoutSession,
  ) => Effect.Effect<CheckoutSession, StripeError>;
  /**
   * Verify a raw webhook delivery's signature against the signing secret and
   * return the decoded event (issue #66). Any signature mismatch, missing
   * header, or malformed payload is normalised to a {@link StripeError} — the
   * caller rejects the delivery without learning the SDK's throw surface. Uses
   * async Web Crypto (`constructEventAsync`) so it runs on `workerd`.
   */
  readonly constructWebhookEvent: (
    delivery: WebhookDelivery,
  ) => Effect.Effect<WebhookEvent, StripeError>;
}

/** The Effect service tag callers depend on instead of the SDK. */
export class Stripe extends Context.Tag("Stripe")<Stripe, StripeService>() {}

/** Map the shop's domain request onto Stripe's embedded-checkout params. */
const toCheckoutParams = (
  params: CreateCheckoutSession,
): StripeSdk.Checkout.SessionCreateParams => ({
  ui_mode: "embedded_page",
  mode: "payment",
  return_url: params.returnUrl,
  ...(params.metadata ? { metadata: params.metadata } : {}),
  line_items: params.lineItems.map((item) => ({
    quantity: item.quantity,
    price_data: {
      // The domain currency is upper-case (`SEK`/`EUR`); Stripe wants lower-case.
      currency: item.price.currency.toLowerCase(),
      unit_amount: item.price.amount,
      product_data: { name: item.name },
    },
  })),
});

/** Build the live port over an SDK client (kept separate so it stays testable). */
const liveFromSdk = (sdk: StripeSdk): StripeService => ({
  createCheckoutSession: (params) =>
    Effect.tryPromise({
      try: () => sdk.checkout.sessions.create(toCheckoutParams(params)),
      catch: (cause) =>
        new StripeError({
          message: "Failed to create Stripe Checkout Session",
          cause,
        }),
    }).pipe(
      Effect.flatMap((session) =>
        session.client_secret
          ? Effect.succeed({
              id: session.id,
              clientSecret: session.client_secret,
            })
          : Effect.fail(
              new StripeError({
                message: "Stripe Checkout Session is missing a client_secret",
              }),
            ),
      ),
    ),

  constructWebhookEvent: (delivery) =>
    Effect.tryPromise({
      // `constructEventAsync` uses async Web Crypto (workerd-safe) and both
      // verifies the signature and decodes the payload in one step; a missing
      // header, bad signature, or unparseable body all reject here.
      try: () =>
        sdk.webhooks.constructEventAsync(
          delivery.payload,
          delivery.signature ?? "",
          delivery.secret,
        ),
      catch: (cause) =>
        new StripeError({
          message: "Stripe webhook signature verification failed",
          cause,
        }),
    }).pipe(Effect.map((event) => ({ id: event.id, type: event.type }))),
});

/**
 * The live {@link Stripe} layer, built per-invocation from a test-mode secret
 * (`sk_test_…`) read from `cloudflare:workers`' `env` by the caller (ADR-0014).
 * The SDK uses its fetch HTTP client so it runs on `workerd` with no Node APIs.
 */
export const layer = (secretKey: string): Layer.Layer<Stripe> =>
  Layer.succeed(
    Stripe,
    liveFromSdk(
      new StripeSdk(secretKey, {
        httpClient: StripeSdk.createFetchHttpClient(),
      }),
    ),
  );

/** Configuration for the test fake — a canned session, or a canned failure. */
export interface FakeStripeConfig {
  readonly session?: CheckoutSession;
  readonly failWith?: StripeError;
  /** A canned verified event returned by {@link StripeService.constructWebhookEvent}. */
  readonly event?: WebhookEvent;
}

/** A faked {@link Stripe} port plus the calls it recorded, for assertions. */
export interface FakeStripe {
  readonly layer: Layer.Layer<Stripe>;
  readonly calls: {
    readonly createCheckoutSession: readonly CreateCheckoutSession[];
    readonly constructWebhookEvent: readonly WebhookDelivery[];
  };
}

const DEFAULT_SESSION: CheckoutSession = {
  id: "cs_test_fake",
  clientSecret: "cs_test_fake_secret",
};

const DEFAULT_EVENT: WebhookEvent = {
  id: "evt_test_fake",
  type: "checkout.session.completed",
};

/**
 * A faked port for `@cloudflare/vitest-pool-workers`-free unit tests: it records
 * every call and returns a canned session (or a canned {@link StripeError}), so
 * no external Stripe call is ever made in CI (issue #61). Server units that
 * depend on {@link Stripe} provide `fake.layer` and assert against `fake.calls`.
 */
export const makeFakeStripe = (config: FakeStripeConfig = {}): FakeStripe => {
  const calls: {
    createCheckoutSession: CreateCheckoutSession[];
    constructWebhookEvent: WebhookDelivery[];
  } = {
    createCheckoutSession: [],
    constructWebhookEvent: [],
  };

  const service: StripeService = {
    createCheckoutSession: (params) =>
      Effect.sync(() => calls.createCheckoutSession.push(params)).pipe(
        Effect.andThen(() =>
          config.failWith
            ? Effect.fail(config.failWith)
            : Effect.succeed(config.session ?? DEFAULT_SESSION),
        ),
      ),
    constructWebhookEvent: (delivery) =>
      Effect.sync(() => calls.constructWebhookEvent.push(delivery)).pipe(
        Effect.andThen(() =>
          config.failWith
            ? Effect.fail(config.failWith)
            : Effect.succeed(config.event ?? DEFAULT_EVENT),
        ),
      ),
  };

  return { layer: Layer.succeed(Stripe, service), calls };
};
