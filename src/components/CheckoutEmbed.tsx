import { actions } from "astro:actions";
import type { StripeEmbeddedCheckout } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useRef, useState } from "preact/hooks";

// The signed quote, derived from `validateCheckout`'s inferred return type so this
// client component never imports from src/server (ADR-0014). It is carried back to
// `createCheckoutSession`, which re-verifies it server-side before charging.
type ValidateData = Awaited<
  ReturnType<typeof actions.validateCheckout>
>["data"];
type Quote = Extract<NonNullable<ValidateData>, { ok: true }>["quote"];

type Props = {
  quote: Quote;
};

/**
 * The embed-mount boundary (#65). Given a validated quote, this loads Stripe.js
 * and mounts the **embedded** Checkout: Stripe calls back `fetchClientSecret`,
 * which invokes the `createCheckoutSession` Action — the server re-verifies the
 * quote, writes the `pending` order, and returns the session's `client_secret`.
 * The payment UI itself lives inside Stripe's iframe; the return page (#53) is out
 * of scope, so `returnUrl` points at a route this ticket does not build.
 */
export default function CheckoutEmbed({ quote }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const publishableKey = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      setError("Payment is temporarily unavailable.");
      return;
    }

    let checkout: StripeEmbeddedCheckout | undefined;
    let cancelled = false;

    (async () => {
      const stripe = await loadStripe(publishableKey);
      if (!stripe || cancelled) {
        return;
      }
      try {
        checkout = await stripe.initEmbeddedCheckout({
          fetchClientSecret: async () => {
            const { data, error: actionError } =
              await actions.createCheckoutSession({
                // The Action decodes and re-verifies the quote server-side
                // (SignedQuoteSchema + HMAC), so the client passes it verbatim.
                quote,
                returnUrl: `${window.location.origin}/checkout/return`,
              });
            if (actionError || !data || !data.ok) {
              throw new Error("Could not start checkout");
            }
            return data.clientSecret;
          },
        });
        // A re-render can unmount us before init resolves; don't mount a stale one.
        if (cancelled) {
          checkout.destroy();
          return;
        }
        if (containerRef.current) {
          checkout.mount(containerRef.current);
        }
      } catch {
        if (!cancelled) {
          setError("Could not start checkout. Please try again.");
        }
      }
    })();

    return () => {
      cancelled = true;
      checkout?.destroy();
    };
  }, [quote]);

  if (error) {
    return <p data-testid="checkout-embed-error">{error}</p>;
  }

  return <div data-testid="checkout-embed" ref={containerRef} />;
}
