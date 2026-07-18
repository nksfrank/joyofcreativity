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

## Database

The shop's durable memory is a **Cloudflare D1** database (binding `DB`, region `weur` — EU),
accessed through **one runtime driver everywhere**: `drizzle-orm/d1` over a real D1 binding.
See ADR-0015 for the full contract. A cold-starting agent needs these facts:

- **Where it lives.** Schema in `src/server/db/schema.ts`; the Drizzle client constructor
  `createDb(binding)` and the `Database` service tag in `client.ts`; reads/writes in sibling
  modules (e.g. `stock.ts`). Repos are Effect programs (ADR-0014): they declare the `Database`
  requirement and the caller — an Action reading `env.DB` via `import { env } from
  "cloudflare:workers"` (ADR-0013), **not** the removed `Astro.locals.runtime.env` — provides
  `Layer.succeed(Database, createDb(env.DB))`.
- **The one table so far: `stock`.** One row per **Blank**: `blank_id` (PK) and `on_hand` (a
  non-negative integer — a table CHECK enforces `on_hand >= 0`). Stock lives here because it is
  shared inventory. Reservation/decrement columns are **not** here — they belong to #34/#35.
- **Authoring ≠ application.** `npm run db:generate` (drizzle-kit) **authors** plain-SQL migrations
  into `drizzle/migrations`; `npm run db:migrate:local` / `db:migrate:remote` (wrangler)
  **apply** them. Never hand-edit a generated schema migration; add a `drizzle-kit generate
  --custom` migration for data changes so the journal stays consistent.
- **Seeding.** Fixture numbers ship as data migration `0001_seed_stock.sql`. Drift is closed by the
  **deploy seed-sync** (`seed.ts` → `buildSeedSyncSql`, run by `db:seed-sync:remote`, wired into
  `deploy`): it upserts `on_hand = 0` for any code-defined Blank with no row and never touches an
  existing row. So adding a Blank in `src/libs/blank.ts` reaches D1 on the next deploy.
- **Tests run against a real D1.** `src/server/db/**` tests use `@cloudflare/vitest-pool-workers`
  (a real, per-test-isolated migrated D1) as the `workers` vitest project; pure-engine/store tests
  stay on the fast `node` project. `npm test` runs both.
- **First-time setup.** `wrangler d1 create joyofcreativity --location weur`, put the printed id in
  `wrangler.jsonc` (`database_id`, currently a placeholder), then `npm run db:migrate:local`.
  `npm run db:studio` opens Drizzle Studio against remote D1 (needs `CLOUDFLARE_ACCOUNT_ID` /
  `CLOUDFLARE_DATABASE_ID` / `CLOUDFLARE_D1_TOKEN`).
