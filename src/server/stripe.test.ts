import { Effect, Exit, type Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  type CreateCheckoutSession,
  makeFakeStripe,
  Stripe,
  StripeError,
} from "./stripe";

/** A representative embedded-checkout request, in the shop's minor-units money. */
const request: CreateCheckoutSession = {
  returnUrl: "https://shop.example/checkout/return",
  lineItems: [
    {
      name: "Hand-knit hat",
      amountMinorUnits: 49900,
      currency: "sek",
      quantity: 1,
    },
  ],
};

const run = <A, E>(
  program: Effect.Effect<A, E, Stripe>,
  layer: Layer.Layer<Stripe>,
) => Effect.runPromiseExit(Effect.provide(program, layer));

const useStripe = <A, E>(
  f: (stripe: Stripe["Type"]) => Effect.Effect<A, E, Stripe>,
) =>
  Effect.gen(function* () {
    const stripe = yield* Stripe;
    return yield* f(stripe);
  });

describe("Stripe port (faked)", () => {
  it("creates a checkout session and returns its id + client secret", async () => {
    const fake = makeFakeStripe();

    const exit = await run(
      useStripe((stripe) => stripe.createCheckoutSession(request)),
      fake.layer,
    );

    expect(exit).toStrictEqual(
      Exit.succeed({ id: "cs_test_fake", clientSecret: "cs_test_fake_secret" }),
    );
  });

  it("records the request it was handed, so callers can assert the wire shape with no network call", async () => {
    const fake = makeFakeStripe();

    await run(
      useStripe((stripe) => stripe.createCheckoutSession(request)),
      fake.layer,
    );

    expect(fake.calls.createCheckoutSession).toStrictEqual([request]);
  });

  it("returns a caller-configured session", async () => {
    const session = { id: "cs_test_123", clientSecret: "cs_test_123_secret" };
    const fake = makeFakeStripe({ session });

    const exit = await run(
      useStripe((stripe) => stripe.createCheckoutSession(request)),
      fake.layer,
    );

    expect(exit).toStrictEqual(Exit.succeed(session));
  });

  it("surfaces a configured failure as a typed StripeError", async () => {
    const fake = makeFakeStripe({
      failWith: new StripeError({ message: "card_declined" }),
    });

    const exit = await run(
      useStripe((stripe) => stripe.createCheckoutSession(request)),
      fake.layer,
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });
});
