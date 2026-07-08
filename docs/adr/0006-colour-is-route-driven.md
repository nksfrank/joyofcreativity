# 6. Colour is route-driven; one page per offered colour

Status: Accepted

## Context

Each Product Detail page is pinned to a single blank, so the page's route already implies a colour.
The configurator's other fields (size, pattern, yarn, customisation) are configured in-place, but
colour behaves differently: it is the page's identity. Not every offered colour has a hand-authored
detail today (product 1 offers ~6 colours; only cream + red are curated).

## Decision

- **Colour is derived from the route**, not from in-page state. The default (and only initially
  selected) field is the colour implied by the current page's blank.
- **`getStaticPaths` emits a page for every colour the family offers** (derived from its blanks),
  not just hand-authored details. Curated `ProductDetail` texts override the generated defaults
  where they exist; other colours get a generated page.
- **Changing colour navigates** to that colour's page. Because every offered colour has a page,
  there is **no `?color=` query-param fallback** — colour is always a real, indexable URL.
- Follow the [[paraglide-url-strategy-pitfalls]] guidance for these links (localized hrefs,
  trailing-slash consistency) to avoid the known redirect/notFound loops.

## Consequences

- Clean SEO/canonicalisation: one indexable URL per colour, no duplicate `?color=` variants.
- Size/pattern/yarn/customisation selections are **not carried across a colour navigation** unless
  we explicitly persist them (they reset on navigation for now; revisit if it hurts UX).
- The old e2e spec's `?color=` assertion no longer applies and must be rewritten to assert the
  colour navigation instead.

## Rejected alternatives

- **Sparse details + `?color=` for the rest** — two different colour behaviours coexisting.
- **Require a curated detail per colour** — couples merchandising to hand-authoring.
