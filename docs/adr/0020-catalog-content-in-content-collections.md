# 20. Product content + SEO live in an Astro Content Collection, split from the code-defined model

Status: Accepted

## Context

Before the transact+fulfil foundation (#54, persistence design #30), a Product Detail's
everything — its structural/pricing shape *and* its marketing copy and SEO metadata — was a
single code-defined fixture in `src/libs/`. That conflates three things with different owners
and change cadences:

- **Structural / pricing model** — base price, offered blanks, pattern variants, yarn colours,
  price modifiers, customisation rules. Consumed by the **isomorphic engines** (`PricingManager`,
  `AvailabilityManager`), which must run client-side with no async load (ADR-0003).
- **Marketing content + SEO** — a Product Detail's name, slug, image, description, and social/OG
  metadata. Copy-edited far more often than the pricing model, wants git authorship and review,
  and has no place in the engines' hot path.
- **Stock + orders** — genuinely mutable, transactional, per-request truth. That went to D1
  (ADR-0015).

Issue #59 carves the content out of the code. This ADR records where it went and why the
structural model did **not** follow it.

## Decision

- **Content + SEO move to an Astro Content Collection** — `products`, defined in
  `src/content.config.ts`, one git-authored Markdown file per Product Detail under
  `src/content/products/`. Frontmatter is typed by a zod schema (via `astro/zod`, per ADR-0014 —
  no direct `zod` dependency) carrying `productId`, `blankId`, `name`, `slug`, `image`,
  `description`, `locale`, and an optional `seo` override object; the Markdown body renders as a
  page section. SEO fields are all optional and fall back to the entry's own
  name/description/image, so a file authors only what it wants to differ.
- **The entry `id` is the ProductDetail id** (the filename, e.g. `"1"`), pinned via the glob
  loader's `generateId`, so routes stay `/product/{id}/{slug}` unchanged (ADR-0006). Without this
  the loader would take the frontmatter `slug` as the id and rewrite every URL.
- **The structural / pricing model stays code-defined in `src/libs/`.** The engines keep reading
  it synchronously in the browser; nothing about pricing or feasibility becomes an async content
  read. `productId` / `blankId` in the frontmatter are the join back to that code-defined model.
- **`locale` is one dimension, defaulting to `"sv"`.** Localization (#45) will *filter* entries by
  it — a new dimension over the same shape, not a reshape of these fields. Out of scope here.

## Consequences

- Copy and SEO are edited as reviewable Markdown, decoupled from the code that prices and
  feasibility-checks a configuration; a wording change never touches `src/libs/`.
- Three catalog concerns now have three homes by owner and cadence: structural/pricing model in
  code, content + SEO in the collection, stock + orders in D1 (ADR-0015). D1 holds **only** stock
  and orders — never catalog content.
- A Product Detail needs both a content entry *and* a matching code-defined family; the
  `productId`/`blankId` frontmatter is the contract between them, unchecked at build beyond zod's
  shape (a mismatch surfaces as a missing family at render).

## Rejected alternatives

- **Keep content in code (`src/libs/`)** — rejected: forces a redeploy and a code review for a
  copy tweak, and drags marketing strings through the isomorphic engine modules.
- **Move the structural/pricing model into the collection too** — rejected: the engines would then
  depend on an async content load client-side, contradicting ADR-0003. The split is deliberate.
- **Put content in D1** — rejected: D1 is reserved for the genuinely mutable, transactional truth
  (stock, orders, ADR-0015); git-authored copy wants version control and PR review, not a runtime
  table.
