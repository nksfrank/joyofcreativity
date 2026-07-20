import { Effect, Exit, type Layer } from "effect";
import { Stripe } from "./stripe";

/**
 * The Stripe webhook handler (issue #66) — the seam #35 fills.
 *
 * This establishes only the correctly-shaped endpoint: it reads the raw request
 * body (signature verification must run against the exact bytes Stripe signed,
 * not a re-serialised JSON — which is why the webhook is a raw-body API route
 * and not an Astro Action, ADR-0013), verifies the `Stripe-Signature` header
 * against the signing secret with async Web Crypto through the {@link Stripe}
 * port, and then no-ops. A valid signature is accepted (200); an invalid or
 * missing one is rejected (400). **No order is transitioned and no event is
 * reconciled here** — that is #35, which slots its logic in after verification
 * succeeds, where {@link WebhookEvent} is returned.
 *
 * Kept in `src/server/` (not the Astro route) so it is unit-testable under plain
 * Vitest by feeding it a constructed, signed `Request` — no `cloudflare:workers`
 * import in the test path, no external Stripe call in CI. The thin API route
 * only reads the two secrets from `env` and delegates here.
 */
export interface WebhookDeps {
  /**
   * The {@link Stripe} port layer, injected by the caller. The route provides
   * the live `layerFromEnv()` (the one place the SDK is fed its secret key,
   * ADR-0015); tests provide a live layer over a throwaway key. Keeping the port
   * a dependency — not a key this handler builds — is why this module never
   * imports `cloudflare:workers` and stays unit-testable under plain Vitest.
   */
  readonly stripe: Layer.Layer<Stripe>;
  /** The webhook signing secret (`whsec_…`) the signature is verified against. */
  readonly webhookSecret: string;
}

/** Header Stripe sends the HMAC signature in, over the raw request body. */
const SIGNATURE_HEADER = "stripe-signature";

export const handleStripeWebhook = async (
  request: Request,
  deps: WebhookDeps,
): Promise<Response> => {
  // The raw body — the exact bytes the signature covers. Read once.
  const payload = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER);

  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const stripe = yield* Stripe;
      // Verify only; #35 reconciles the returned event. #66 discards it.
      yield* stripe.constructWebhookEvent({
        payload,
        signature,
        secret: deps.webhookSecret,
      });
    }).pipe(Effect.provide(deps.stripe)),
  );

  // A verification failure (bad or missing signature, malformed payload) is the
  // caller's fault → 400. Anything else surfaces the same way here because the
  // port normalises every failure into a StripeError; there is no processing
  // yet whose failure would warrant a 500.
  return Exit.isSuccess(exit)
    ? new Response(null, { status: 200 })
    : new Response("Invalid signature", { status: 400 });
};
