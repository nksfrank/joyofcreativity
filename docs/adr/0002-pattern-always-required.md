# 2. Pattern is always required on an order item

Status: Accepted

## Context

`ProductOrderItem.patternId` is typed as a required `string`, and both availability rules
(`patternCompatibleWithBlank`, `patternYarnCountValid`) `assert` that the referenced pattern
exists. But the target journey (`e2e/product-configurator.spec.ts`) selects no pattern, and the
only seeded product (`Signature Letter Sweater`) has `patternVariants: []`. The contract and the
spec contradict each other.

## Decision

Pattern stays **required**. Every product family must define **≥1 `PatternVariant`**, the
configurator forces a pattern choice, and a Product Order Item is never valid without one.

## Consequences

- The fixme journey must gain a pattern-selection step before it can pass.
- Seed data must give every family at least one pattern (including the Signature Letter Sweater);
  a family that is "just a plain knit" is modelled as a single default pattern, not the absence of one.
- Yarn-colour count is always governed by a concrete pattern's yarn count (originally
  `allowedYarnCount`, a maximum; now `requiredYarnCount`, an exact required count — see ADR-0009),
  so there is no "no pattern → unbounded yarns" edge case to handle.

## Rejected alternative

- **Optional pattern** (`patternId?`, rules no-op when absent) — simpler seed data, but leaves the
  yarn-count and compatibility rules with an ambiguous "no pattern" branch and weakens the type.
