import { actions } from "astro:actions";
import { useStore } from "@nanostores/preact";
import { useState } from "preact/hooks";
import type { Locale } from "@/i18n/runtime";
import { Money } from "@/libs/money";
import { cart, cartTotal, lineIdentity } from "@/stores/cart";

type Props = {
  locale: Locale;
};

// The validateCheckout result, derived from the Action's inferred return type so
// this client component never imports from src/server (ADR-0014).
type CheckoutResult = Awaited<
  ReturnType<typeof actions.validateCheckout>
>["data"];

const bucketLabel: Record<string, string> = {
  tampered: "This item can't be ordered as configured",
  unavailable: "No longer available",
  out_of_stock: "Out of stock",
  price_drift: "Price changed",
};

/** Renders the cart from the stored line snapshots alone — no catalogue lookup (ADR-0007). */
export default function CartView({ locale }: Props) {
  const lines = useStore(cart);
  const total = cartTotal(lines);

  // Checkout is the first authoritative checkpoint (#64): the summary POSTs the
  // trust-minimal cart to `validateCheckout`, which re-prices and re-checks every
  // line server-side and returns either a signed quote or the four-bucket
  // problems, surfaced per line below (all wrong things shown together).
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [checking, setChecking] = useState(false);

  const validate = async () => {
    setChecking(true);
    setResult(null);
    try {
      const { data, error } = await actions.validateCheckout({
        lines: lines.map((line) => ({
          productId: line.productId,
          item: line.item,
          quantity: line.quantity,
        })),
      });
      setResult(error ? undefined : data);
    } finally {
      setChecking(false);
    }
  };

  if (lines.length === 0) {
    return <p data-testid="cart-empty">Your cart is empty.</p>;
  }

  const problemsByIndex = new Map<number, string[]>();
  if (result && !result.ok) {
    for (const problem of result.problems) {
      const label = bucketLabel[problem.bucket] ?? "Problem";
      problemsByIndex.set(problem.index, [label, ...problem.reasons]);
    }
  }

  return (
    <div>
      <ul>
        {lines.map((line, index) => (
          <li
            key={lineIdentity(line.productId, line.item)}
            data-testid="cart-line-item"
          >
            <span data-testid="cart-line-item-name">
              {line.display.productName}
            </span>
            <dl>
              <dt>Colour</dt>
              <dd>{line.display.colour}</dd>
              <dt>Size</dt>
              <dd>{line.display.size}</dd>
              <dt>Pattern</dt>
              <dd>{line.display.pattern}</dd>
              {line.display.yarnColours.length > 0 && (
                <>
                  <dt>Yarn colours</dt>
                  <dd>{line.display.yarnColours.join(", ")}</dd>
                </>
              )}
              {line.display.customisation && (
                <>
                  <dt>Custom text</dt>
                  <dd>{line.display.customisation}</dd>
                </>
              )}
              <dt>Quantity</dt>
              <dd data-testid="cart-line-item-quantity">{line.quantity}</dd>
            </dl>
            <span data-testid="cart-line-item-price">
              {Money.from(line.price).format(locale)}
            </span>
            {problemsByIndex.has(index) && (
              <ul data-testid="cart-line-item-problem">
                {problemsByIndex.get(index)?.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {total && (
        <p>
          Total: <span data-testid="cart-total">{total.format(locale)}</span>
        </p>
      )}

      <button
        type="button"
        onClick={validate}
        disabled={checking}
        data-testid="checkout-validate"
      >
        Proceed to checkout
      </button>

      {result?.ok && (
        <p data-testid="checkout-ready">
          Everything checks out — ready to pay.
        </p>
      )}

      {result && !result.ok && (
        <div role="alert" aria-label="Checkout problems">
          {/* Cart-level problems (e.g. mixed currency) carry index -1. */}
          {problemsByIndex.has(-1) && (
            <ul data-testid="cart-problem">
              {problemsByIndex.get(-1)?.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <p data-testid="checkout-blocked">
            Some items need attention before checkout.
          </p>
        </div>
      )}

      {result === undefined && (
        <p data-testid="checkout-error">
          Could not verify your cart. Please try again.
        </p>
      )}
    </div>
  );
}
