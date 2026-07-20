import StripeSdk from "stripe";
import type { WebhookEvent } from "./stripe";

/**
 * Shared test scaffolding for the Stripe webhook path (issues #61/#66). The port
 * test and the handler test both need to mint *validly signed* deliveries; this
 * is the one place that imports the SDK to do so, so the `generateTestHeaderString`
 * detail — and the throwaway secrets — live in a single module instead of being
 * copy-pasted across test files.
 *
 * Not a `*.test.ts` file, so Vitest never collects it as a suite. Signing is pure
 * Web Crypto over the signing secret: no Stripe call is ever made (issue #61).
 */

/** The API key only initialises the SDK client; verification never uses it. */
export const TEST_SECRET_KEY = "sk_test_unused";

/** The signing secret constructed events are signed with in tests. */
export const TEST_WEBHOOK_SECRET = "whsec_test_secret";

/** A representative event body, and the id/type its verification should yield. */
export const TEST_EVENT: WebhookEvent = {
  id: "evt_test_123",
  type: "checkout.session.completed",
};

export const TEST_EVENT_BODY = JSON.stringify({
  ...TEST_EVENT,
  data: { object: { id: "cs_test_123" } },
});

const sdk = new StripeSdk(TEST_SECRET_KEY, {
  httpClient: StripeSdk.createFetchHttpClient(),
});

/** Produce a valid `Stripe-Signature` header for `payload` under `secret`. */
export const signWebhookPayload = (
  payload: string,
  secret: string = TEST_WEBHOOK_SECRET,
): string => sdk.webhooks.generateTestHeaderString({ payload, secret });
