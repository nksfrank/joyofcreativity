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
}

/** A faked {@link Stripe} port plus the calls it recorded, for assertions. */
export interface FakeStripe {
  readonly layer: Layer.Layer<Stripe>;
  readonly calls: {
    readonly createCheckoutSession: readonly CreateCheckoutSession[];
  };
}

const DEFAULT_SESSION: CheckoutSession = {
  id: "cs_test_fake",
  clientSecret: "cs_test_fake_secret",
};

/**
 * A faked port for `@cloudflare/vitest-pool-workers`-free unit tests: it records
 * every call and returns a canned session (or a canned {@link StripeError}), so
 * no external Stripe call is ever made in CI (issue #61). Server units that
 * depend on {@link Stripe} provide `fake.layer` and assert against `fake.calls`.
 */
export const makeFakeStripe = (config: FakeStripeConfig = {}): FakeStripe => {
  const calls: { createCheckoutSession: CreateCheckoutSession[] } = {
    createCheckoutSession: [],
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
  };

  return { layer: Layer.succeed(Stripe, service), calls };
};
