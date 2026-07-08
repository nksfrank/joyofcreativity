import { useStore } from "@nanostores/preact";
import type { Locale } from "@/i18n/runtime";
import { formatMoney } from "@/libs/pricing";
import { cart, cartTotal, lineIdentity } from "@/stores/cart";

type Props = {
  locale: Locale;
};

/** Renders the cart from the stored line snapshots alone — no catalogue lookup (ADR-0007). */
export default function CartView({ locale }: Props) {
  const lines = useStore(cart);
  const total = cartTotal(lines);

  if (lines.length === 0) {
    return <p data-testid="cart-empty">Your cart is empty.</p>;
  }

  return (
    <div>
      <ul>
        {lines.map((line) => (
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
              {formatMoney(line.price, locale)}
            </span>
          </li>
        ))}
      </ul>
      {total && (
        <p>
          Total:{" "}
          <span data-testid="cart-total">{formatMoney(total, locale)}</span>
        </p>
      )}
    </div>
  );
}
