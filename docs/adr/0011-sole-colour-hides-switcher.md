# 11. A sole-colour family hides its colour switcher

Status: Accepted

## Context

Colour is route-driven: `getStaticPaths` emits one page per colour a family offers, and changing
colour navigates between those pages (ADR-0006). The product page renders a colour switcher `<nav>`
listing every offered colour, with the current colour marked `aria-current`.

When a family offers exactly **one** colour, that switcher lists a single link — and it points back
to the page the customer is already on. It offers a choice that isn't a choice: there is nowhere to
switch to. This is the colour case of the broader "no decision to make" problem in the parent epic
(nksfrank/joyofcreativity#12).

## Decision

- **A family offered in exactly one colour renders no colour switcher `<nav>`.** The page decides
  this from the resolved colour navigation (`colourNav.length > 1`); it is an Astro-page concern,
  independent of the configurator island.
- **Two or more colours render the switcher unchanged** — every colour marked, route-driven, per
  ADR-0006.
- **The sole colour is still shown** in the product info on the page, and continues to appear in the
  cart line after add-to-cart. Hiding the *switcher* must not hide the *colour*.

## Consequences

- A single-colour product page is simpler: the customer sees which colour they are buying without a
  redundant navigator.
- Seed data must include a single-colour family so this behaviour can be driven in e2e.

## Rejected alternatives

- **Render the lone switcher but disable its only link** — still presents a control that implies a
  choice, and adds a disabled-state to reason about for no benefit.
