# 5. Configuration model: disable-only via full feasibility, in a dedicated orchestrator

Status: Accepted

## Context

The configurator must prevent invalid configurations rather than let them be built and then
rejected (disable-only UX). Colour, size, and pattern constrain each other in both directions
(a pattern restricts compatible blanks and caps yarn count; a blank must be in stock). The
existing `PricingManager`/`AvailabilityManager` only evaluate a *complete* `ProductOrderItem` —
they cannot say whether a partial selection is still on a path to a valid item.

## Decision

- Add a **Configuration orchestrator** (working name `ConfigurationModel`) that owns partial
  selection state. It takes a `ProductDefinition` + a partial selection and returns, for each
  field, the list of options with a `disabled` flag, plus the live price when the selection is
  complete enough to price. The two existing engines stay **pure and untouched**; the orchestrator
  is the only thing the island talks to.
- An option is **enabled iff a full valid, in-stock completion exists** with that option chosen.
  The orchestrator brute-forces completions over the (deliberately tiny: ≤42 blanks, few patterns,
  few yarns) option space and marks an option enabled iff at least one completion passes
  `AvailabilityManager.check`.
- Because feasibility is checked with lookahead, the customer **cannot pick their way into a
  dead-end** by normal navigation. If a state ever has *no* valid option in a required field
  (e.g. the initially chosen colour has no in-stock, pattern-compatible completion at all), show a
  **dialog** explaining why and **reset the offending downstream selection**.

## Consequences

- Correctness of the whole feature lives in one small, testable, pure module — not in the UI.
- Feasibility search is O(completions) per render; fine at this catalogue size. Revisit (indexing /
  memoisation) only if the option space grows by orders of magnitude.
- Add-to-cart is safe by construction: if the UI let you complete a selection, it is valid.

## Rejected alternatives

- **Local pairwise checks** — cheaper, but leak avoidable dead-ends onto the reset dialog.
- **Methods on AvailabilityManager** — mixes whole-item validation with partial-selection
  feasibility in one class; keep the pure engine focused.
