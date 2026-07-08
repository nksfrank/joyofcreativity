# 7. Cart line shape: config + price snapshot + display descriptor + quantity

Status: Accepted

## Context

The cart is client-persisted (ADR-0001) and its lines must render human labels (colour, size, yarn
names, custom text) and a stable price (ADR-0004) on a separate page, without shipping catalogue
lookup tables to that page. Adding the same configuration twice should not create duplicate lines.

## Decision

A **Cart Line** is:

```
{
  productId: string;
  item: ProductOrderItem;        // the resolved configuration (blank, pattern, yarns, text)
  price: Price;                  // snapshot at add-time (ADR-0004)
  display: {                     // resolved labels snapshot at add-time
    productName: string;
    colour: string;
    size: string;
    pattern: string;
    yarnColours: string[];
    customisation: string;
  };
  quantity: number;
}
```

- **Quantity lives on the cart line, not on `ProductOrderItem`.** The order item stays a pure
  description of one configured product.
- **Merge identity** = `productId` + `blankId` + `patternId` + *sorted* `yarnColorIds` +
  `customisation`. Adding an item whose identity matches an existing line **increments quantity**;
  otherwise it appends a new line.
- Both `price` and `display` are **snapshots**; the cart/checkout pages need no catalogue access.

## Consequences

- Cart/checkout are decoupled from the catalogue — they render from the line alone.
- Snapshots can drift from the catalogue (renames, price changes). Accepted; reconciliation is a
  checkout-time concern (deferred with the checkout page — see ADR-0001).
- Stock is **advisory at add-time** (block only if the chosen blank shows 0 in the shipped
  snapshot); authoritative stock/price re-validation is deferred to a future checkout page.

## Rejected alternative

- **Store ids only, re-resolve at render** — always-current labels, but couples the cart page to
  the catalogue and ships more data.
