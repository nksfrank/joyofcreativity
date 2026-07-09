# 10. Single-alternative attributes auto-select (structural-single only)

Status: Accepted

## Context

When a product family defines exactly one option for an attribute, today's configurator still
makes the customer click it: a lone size or pattern radio must be selected before the item prices,
and a family with one colour renders a colour `<nav>` whose single link points at the current page.
There is no choice to make, yet the UI demands the motion.

## Decision

The configurator **auto-selects** an attribute that is **structurally single** — the family defines
exactly one option. The control stays visible and interactive (it is a pre-fill, not a lock), so
size and pattern resolve on load and a price can appear immediately. A sole colour **hides** its
switcher `<nav>` entirely, since there is nowhere to navigate. Yarn inherits this through ADR-0009:
a selector field with one available yarn auto-selects it.

The trigger is the **structural** option count only — *not* feasibility leaving exactly one option
enabled after the rest are disabled.

## Consequences

- A customer landing on a fully-single-option product sees it priced and add-to-cart-able at once.
- "Structurally single" is stable across a session: the sole option never shifts as other
  selections change, so auto-select can never silently re-pick or cascade.

## Rejected alternative

- **Auto-select the last enabled option** (feasibility-single, not structural) — more "helpful",
  but the auto-pick shifts as selections change and choosing one attribute could silently select
  another. The jumpiness is not worth the marginal convenience; kept manual.
