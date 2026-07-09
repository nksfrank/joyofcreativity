# 9. Yarn is an exact required count of order-insignificant colours

Status: Accepted

## Context

Yarn colours were a set bounded only by a *maximum* (`PatternVariant.allowedYarnCount`): the
availability engine failed only when `yarnColorIds.length > allowedYarnCount`. That let two invalid
things through and left one thing unsaid:

- Zero yarns was accepted for any pattern, so an item could check out missing colours the pattern
  needs.
- A pattern designed for a fixed number of colours could not express it — "no fewer than N" was
  unrepresentable.
- A single available yarn colour had no natural behaviour: a lone checkbox the customer may or may
  not tick.

The redesign (parent nksfrank/joyofcreativity#12) makes a pattern take a specific number of colours,
rendered as that many required selector fields.

## Decision

- Rename `PatternVariant.allowedYarnCount` → **`requiredYarnCount`**: the **exact, required** number
  of yarn colours the pattern takes. `requiredYarnCount: 0` is a plain knit with no yarn choice.
- A valid `ProductOrderItem` has `yarnColorIds.length === requiredYarnCount` for its chosen pattern.
  The availability engine's yarn-count rule becomes an **exact-count** rule (fails on `!==`),
  replacing the old max rule. The per-id `yarnAvailable` rule is unchanged and applies to every
  entry, including repeated ones.
- The list is an order-insignificant **multiset**: **duplicates are allowed** (the same colour may
  fill more than one field) and field order carries no meaning. There are **no per-field roles**
  (no body vs trim). Cart identity already sorts `yarnColorIds` (ADR-0007), so reordered fields
  merge and different multisets stay distinct — no cart change is needed.
- `ConfigurationModel` exposes yarn as **N per-field option lists** (`yarnFields()`), N being the
  chosen pattern's `requiredYarnCount`; each field offers every available yarn colour. No pattern
  chosen → no fields (count unknown); `requiredYarnCount: 0` → no fields. A field whose available
  list has exactly one colour **auto-resolves** to it.
- Feasibility (ADR-0005) accounts for the exact-count rule: a completion fills N picks from the
  available yarns with repetition allowed, so **one available colour suffices for any N**, and a
  pattern with `requiredYarnCount > 0` and **zero available yarns is infeasible** and reported
  disabled.

## Consequences

- `orderItem()`/`price()` resolve only once every required yarn field is filled (in addition to the
  existing size + pattern + validity conditions).
- The rename is a mechanical sweep across `product.types.ts`, the availability rule, the model, seed
  data, and all fixtures.
- The checkbox-based configure journey no longer maps to the model; its e2e is parked `test.fixme`
  until the configurator island renders required `<select>` fields (nksfrank/joyofcreativity#12).

## Rejected alternatives

- **Keep the maximum** (`allowedYarnCount`) — cannot require a fixed colour count and admits the
  zero-yarn item.
- **Per-slot roles / minimum-distinct-colours** — positional meaning (body vs trim) or a
  "≥ K distinct" constraint. Rejected: fields are an order-insignificant multiset with duplicates
  allowed; roles are out of scope for this feature.
