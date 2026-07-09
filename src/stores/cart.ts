import { persistentAtom } from "@nanostores/persistent";
import { computed } from "nanostores";
import type { Price } from "@/libs/pricing";
import type { ProductOrderItem } from "@/libs/product.types";

/** Resolved labels captured at add-time so the cart renders without catalogue lookup (ADR-0007). */
export type CartDisplay = {
  productName: string;
  colour: string;
  size: string;
  pattern: string;
  yarnColours: string[];
  customisation: string;
};

/** One line in the cart: a resolved order item plus price + display snapshots and a quantity. */
export type CartLine = {
  productId: string;
  item: ProductOrderItem;
  price: Price;
  display: CartDisplay;
  quantity: number;
};

/** Everything needed to add a line except its quantity, which the store manages via merge. */
export type AddLineInput = Omit<CartLine, "quantity">;

/**
 * Merge identity = product + blank + pattern + sorted yarn colours + customisation.
 * Yarn order is normalised so re-selecting the same colours in a different order still merges.
 */
export const lineIdentity = (
  productId: string,
  item: ProductOrderItem,
): string =>
  [
    productId,
    item.blankId,
    item.patternId,
    [...item.yarnColorIds].sort().join(","),
    item.customisation,
  ].join("|");

/** Appends the line, or increments quantity when an identical configuration is already present. */
export const mergeLine = (
  lines: CartLine[],
  input: AddLineInput,
): CartLine[] => {
  const id = lineIdentity(input.productId, input.item);
  const existing = lines.find(
    (line) => lineIdentity(line.productId, line.item) === id,
  );
  if (existing) {
    return lines.map((line) =>
      line === existing ? { ...line, quantity: line.quantity + 1 } : line,
    );
  }
  return [...lines, { ...input, quantity: 1 }];
};

/** Total number of items across all lines (sum of quantities). */
export const cartCount = (lines: CartLine[]): number =>
  lines.reduce((total, line) => total + line.quantity, 0);

/** Running total computed from the line snapshots alone; null for an empty cart. */
export const cartTotal = (lines: CartLine[]): Price | null => {
  const first = lines.at(0);
  if (!first) {
    return null;
  }
  const amount = lines.reduce(
    (total, line) => total + line.price.amount * line.quantity,
    0,
  );
  return { amount, currency: first.price.currency };
};

/** The persisted cart, shared across islands (ADR-0001, ADR-0008). */
export const cart = persistentAtom<CartLine[]>("joc:cart", [], {
  encode: JSON.stringify,
  decode: JSON.parse,
});

export const addLine = (input: AddLineInput): void => {
  cart.set(mergeLine(cart.get(), input));
};

/** Reactive item count for the layout cart badge. */
export const cartItemCount = computed(cart, cartCount);
