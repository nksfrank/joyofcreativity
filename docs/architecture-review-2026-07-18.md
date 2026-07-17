# Architecture review — 2026-07-18

Deep-module review of the isomorphic core (`src/libs/`), produced by the
`/improve-codebase-architecture` skill. Vocabulary: **module / interface /
implementation / depth / seam / adapter / leverage / locality** (design glossary);
domain terms from `CONTEXT.md`.

Four deepening candidates. Candidate 1 is scheduled (tickets #70–#73); candidates
2–4 are **not yet ticketed** — recorded here so the analysis isn't lost.

---

## 1 · A deep `Catalogue` resolver — **Strong** · scheduled (#70–#73)

**Files:** `pricing.ts`, `availability.ts`, `configuration.ts`, `blank.utils.ts`, `product.utils.ts`

**Problem:** `ProductDefinition` and the blank catalogue are bare records; five
modules re-derive the same by-id lookups (`patternVariants.find`,
`availableYarnColours.find`, blank/colour/size finds) with *three* inconsistent
not-found policies — `assert` (pricing/availability), `?? ""` (config labels),
silent skip (blank.utils/product.utils).

**Solution (grilled):** two isomorphic, sync resolver classes.
- Global `Catalogue` over `blank.ts` fixtures: `get`/`require` for blank/colour/size,
  plus the blank → (colour, size) join (`blankOption`, `describe`).
- Per-definition `ProductCatalogue` (built like `PricingManager`): `get`/`require`
  for pattern variant + yarn, `getOfferedBlank` (absorbs `resolveProductBlank`),
  `blankOptions()` — composing `Catalogue`.
- Policy: **not one policy but a principled two** — `get → T | undefined`,
  `require → T` (throws one canonical message). Engines call `require`; builders
  call `get`. Behaviour-preserving.

**Wins:** locality (one not-found policy); leverage (one interface, 5 call sites);
closes the inconsistent-lookup latent bug; engines shrink to pure rules.

**Sequenced expand → migrate → contract:** #70 build `Catalogue`, #71 build
`ProductCatalogue`, #72 route all consumers, #73 delete `resolveProductBlank` /
`describeBlank` / `resolveBlankOptionsByProduct` (`fixtureStockSnapshot` stays —
it's the stock seam, #58).

---

## 2 · Deepen `Price` into a Money module — **Strong** · not ticketed

**Files:** `pricing.ts`, `pricing.utils.ts`, `stores/cart.ts`, `CartView.tsx`, `product/[id]/[slug].astro`

**Problem:** `Price` is a bare `{amount, currency}` record; arithmetic, minor-unit
division and formatting are spread across five sites. `formatMoney` is duplicated
(the `pricing.utils.ts` copy is dead code, imported nowhere). `cartTotal` sums line
amounts and takes the **first line's** currency with no guard — a mixed SEK+EUR cart
totals silently wrong.

**Solution:** a deep Money module — small interface (`add`, `times`, `zero(ccy)`,
`format(locale)`, `amountString()`), deep implementation owning the single
minor-unit representation, rounding, and a currency-mismatch guard. `cartTotal`,
the modifier math, and all formatting go through it. Delete `pricing.utils.ts`.

**Wins:** locality (minor-unit rule in one module); closes the mixed-currency silent
bug; delete one dead shallow duplicate; interface shrinks, math absorbs inward.

**Note:** sharpens `CONTEXT.md` → Money, an already-named concept.

---

## 3 · A real seam under the content adapter — **Worth exploring** · not ticketed

**Files:** `product-content.ts`, `blank.ts`, `blank.utils.ts`, `product.ts`

**Problem:** the data layer feeding every *tested* engine is itself untested and
fails silently on dangling ids (bad `productId` → `[]`; missing blank → filtered
out). `product-content.ts` (the sole `astro:content` adapter, 6 async functions) is
only reachable through a full build.

**Solution:** put a small `ProductContentSource` interface at the seam so a second,
in-memory adapter can exercise the content logic in tests (two adapters justify the
seam: `astro:content` in prod, in-memory in tests). Add a fixture-integrity check
that rejects dangling colour/size/product ids loudly.

**Wins:** the interface becomes the test surface; two adapters = a real seam; silent
skips become loud failures; root data gains coverage. Respects the issue-#59 seam —
`astro:content` stays behind the adapter, engines stay isomorphic.

---

## 4 · Collapse the Configuration Model query surface — **Worth exploring** · not ticketed

**Files:** `configuration.ts`, `Configurator.tsx`

**Problem:** eight query methods leak a completeness precondition the caller must
hold in its head — `orderItem()`, `orderItemLabels()`, and `price()` are all
nullable on the *same* invariant, but the interface doesn't encode the dependency.
The island also reaches past the model to `definition.customisation` (an ADR-0005
seam leak).

**Solution:** return one `ConfigurationView` record with the mutually-dependent trio
behind a single nullable `ready: { orderItem, price, labels } | null`, plus
`customisationRule` exposed on the model so the island stops reading the definition.

**Wins:** invariant encoded in the interface; island crosses one seam not eight;
null-checking concentrates in one place. Honours ADR-0005 (the model is the only
thing the island talks to) — it tightens the seam the ADR already drew. This
deepens the *interface*, not the implementation.

---

## Top recommendation

**Candidate 1 (the Catalogue resolver)** — highest leverage and clearest locality
win; unifies three inconsistent not-found policies (a latent bug surface) and leaves
2 and 4 reading cleaner. **Candidate 2 (Money)** is the lowest-risk parallel win:
self-contained, deletes dead code, closes the mixed-currency total bug.
