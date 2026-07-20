import { describe, expect, it } from "vitest";
import { layer as liveLayer } from "./stripe";
import {
  signWebhookPayload,
  TEST_EVENT_BODY,
  TEST_SECRET_KEY,
  TEST_WEBHOOK_SECRET,
} from "./stripe.testkit";
import { handleStripeWebhook } from "./stripe-webhook";

/**
 * The webhook route's handler, exercised by feeding it a constructed, signed
 * `Request` — the acceptance criterion for #66. Verification is pure Web Crypto
 * over the signing secret, so there is no external Stripe call in CI. The live
 * port layer is injected here exactly as the route injects `layerFromEnv()`.
 */
const deps = {
  stripe: liveLayer(TEST_SECRET_KEY),
  webhookSecret: TEST_WEBHOOK_SECRET,
};

const post = (body: string, signature: string | null) =>
  new Request("https://shop.example/api/stripe/webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body,
  });

describe("handleStripeWebhook", () => {
  it("accepts a correctly-signed event with 200 and an empty body", async () => {
    const response = await handleStripeWebhook(
      post(TEST_EVENT_BODY, signWebhookPayload(TEST_EVENT_BODY)),
      deps,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("rejects a body whose signature does not match with 400", async () => {
    // A header validly signed for a *different* payload — the tamper case.
    const response = await handleStripeWebhook(
      post(TEST_EVENT_BODY, signWebhookPayload("{}")),
      deps,
    );

    expect(response.status).toBe(400);
  });

  it("rejects a delivery with no signature header with 400", async () => {
    const response = await handleStripeWebhook(
      post(TEST_EVENT_BODY, null),
      deps,
    );

    expect(response.status).toBe(400);
  });

  it("rejects a delivery signed with the wrong secret with 400", async () => {
    const response = await handleStripeWebhook(
      post(TEST_EVENT_BODY, signWebhookPayload(TEST_EVENT_BODY, "whsec_wrong")),
      deps,
    );

    expect(response.status).toBe(400);
  });
});
