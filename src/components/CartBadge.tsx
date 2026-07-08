import { useStore } from "@nanostores/preact";
import { cartItemCount } from "@/stores/cart";

type Props = {
  href: string;
};

/** Layout cart link with a live item count, reachable from every page. */
export default function CartBadge({ href }: Props) {
  const count = useStore(cartItemCount);
  return (
    <a href={href} data-testid="cart-link">
      Cart (<span data-testid="cart-count">{count}</span>)
    </a>
  );
}
