# Context

Joy of Creativity is a storefront for **configurable hand-knit products** (Sweden-first, EU
roadmap). A customer browses curated product pages, configures a product (colour, size, pattern,
yarn colours, custom text), sees a live price, adds the configured item to a cart, and checks out.

The domain core is a set of **pure engines** — pricing and availability — that evaluate a fully
configured selection against a product family's rules. They do no I/O and run identically on
server and client.

## Glossary

Use these terms verbatim in code, tests, issues, and docs. Avoid the listed synonyms.

- **Blank** — the physical raw good behind a product: exactly one **Colour × Size** combination.
  Stock lives here, because it is *shared inventory* — any product built from a blank draws down
  the same count. _Not_ "variant", _not_ "SKU".
- **Product Definition** (a.k.a. **product family**) — the sellable thing: a shared base price,
  the set of blanks it may be built from, and its configuration options (patterns, yarn colours,
  customisation rule). Identified by `productId`.
- **Product Detail** — one *navigable page* for a family, pinned to a single blank, with its own
  marketing texts (name, description, slug, image). A curated SEO entry point and the page's
  default colour — **not** a separate product.
- **Configuration** — an in-progress set of selections in the configurator UI, before it is added
  to the cart.
- **Product Order Item** — a *complete, resolved* configuration: `{ blankId, patternId,
  yarnColorIds, customisation }`. The unit the pricing and availability engines evaluate.
- **Pattern** / **Pattern Variant** — a knit pattern plus the blanks it is `compatibleBlankIds`
  and the *exact* number of yarn colours it takes (`requiredYarnCount`). **Required** on every
  order item. A `requiredYarnCount` of 0 is a plain knit with no yarn choice.
- **Yarn Colour** — a selectable yarn thread colour. The chosen pattern fixes exactly how many are
  picked (`requiredYarnCount`); the customer fills that many single-choice fields. The same colour
  **may repeat** across fields and **order is insignificant** — the selection is a *multiset*, so
  `[red, blue]` and `[blue, red]` are the same product. See ADR-0009. _Not_ "up to N" — it is
  exactly N.
- **Customisation** — free text applied to the product, bounded by the family's `CustomisationRule`
  (`allowText`, `maxLength`).
- **Price Modifier** — a `fixed` (absolute minor-units) or `percentage` adjustment to the family
  base price, attached to a blank/pattern/yarn/customisation choice.
- **Pricing engine** (`PricingManager`) — pure; `calculate(item)` → `Price` in minor units.
- **Availability engine** (`AvailabilityManager`) — pure; `check(item)` → list of failed rules.
- **Cart Line** *(new)* — one line in the cart: `{ productId, item, price, display, quantity }` —
  a Product Order Item plus a price snapshot, a resolved display descriptor, and a quantity.
  Quantity lives here, **not** on the order item. See ADR-0007.
- **Configuration Model** *(new)* — the pure orchestrator that holds a *partial* selection and
  reports, per field, which options are selectable (a `disabled` flag driven by full-completion
  **feasibility**) plus the live price. Wraps the pricing/availability engines; the only thing the
  configurator island talks to. See ADR-0005.
- **Feasibility** *(new)* — whether at least one complete, valid, in-stock Product Order Item still
  exists given a partial selection and a candidate option. The basis for disabling options.
- **Configurator** *(new)* — the hydrated island on the product page that renders the Configuration
  Model and drives it as the customer changes selections. Colour is **route-driven** (ADR-0006),
  not island state.
- **Single-alternative attribute** *(new)* — an attribute the family defines with exactly one
  option. The configurator **auto-selects** it (the control stays visible and interactive), so a
  customer never picks a choice that has no alternative. Triggered by the *structural* count only,
  never by feasibility leaving one option enabled. See ADR-0010. A sole colour hides its switcher
  `<nav>` since there is nothing to navigate to — see ADR-0011.

## Money

All prices are integer **minor units** (öre / cents) in a single `Price { amount, currency }`.
Currencies: `SEK`, `EUR` (both 2-decimal). Never store fractional major-unit values.
