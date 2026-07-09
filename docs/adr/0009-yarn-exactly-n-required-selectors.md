# 9. Yarn colours: exactly-N required selectors, duplicates allowed, order-insignificant

Status: Accepted

## Context

Yarn was modelled as a set of checkboxes bounded by a *maximum* (`PatternVariant.allowedYarnCount`):
the availability engine only failed when `yarnColorIds.length > allowedYarnCount`, so zero yarns
was a valid order item and yarn was effectively optional. This left two problems. A knit pattern
is designed for a specific number of colour regions, not "up to" some cap — the max-only rule
could not express "this pattern needs exactly three colours." And the single-alternative case (one
available yarn) had no natural home: auto-checking a lone checkbox contradicted the max-only,
optional framing.

## Decision

A pattern takes **exactly** `requiredYarnCount` yarn colours (field renamed from
`allowedYarnCount`). The configurator renders that many **single-choice selector fields**, each
choosing from all available yarn colours:

- **Exactly N, all required.** A valid order item has `yarnColorIds.length === requiredYarnCount`.
  The availability rule flips from `length > max` to `length !== requiredYarnCount`. A
  `requiredYarnCount` of 0 renders no selectors and needs no yarn.
- **Duplicates allowed.** Each field is independent; the same colour may fill several fields
  (`red / red / blue`). A family with one available yarn and N fields resolves to that yarn N times.
- **Order-insignificant.** The fields carry no per-slot role; the selection is a *multiset*.
  `lineIdentity` keeps sorting `yarnColorIds`, so `[red, blue]` and `[blue, red]` merge in the cart.

## Consequences

- Yarn selectors are **gated on a chosen pattern** — the field count is unknown until a pattern is
  picked. With a single auto-selected pattern (ADR-0010) they appear immediately.
- `ConfigurationModel` feasibility can no longer use the empty-yarn completion for N>0 patterns.
  A completion must fill N picks from available yarns (repetition allowed), so a pattern with
  `requiredYarnCount > 0` and **zero available yarn colours becomes infeasible** and is disabled.
- Yarn is now genuinely **required**, tightening the guarantee that a priced, add-to-cart-able
  selection is complete.
- Picking the same colour twice applies its price modifier twice — intended (two skeins).

## Rejected alternatives

- **Keep checkboxes, add a minimum** — expresses "exactly N" but keeps the awkward multi-checkbox
  affordance and a separate min/max pair; selectors state the requirement directly.
- **Distinct colour per field** — would force all N picks to differ, making a family unbuildable
  when it has fewer than N available yarns and blocking single-option auto-fill of later fields.
- **Positional slots with roles** (body/trim) — richer, but nothing in the catalogue models a role;
  it would force dropping the cart-identity sort and adding per-slot labels for no current benefit.
