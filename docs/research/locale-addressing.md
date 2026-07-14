# Locale addressing: path-prefix `/[locale]` for all locales

Scope: how an incoming request maps to a locale for the storefront. Content localization itself is
already settled (Content localization strategy, #45) and is **addressing-agnostic** — locale is just
a code (`sv`/`en`/…). This decides the **URL shape** that carries that code, on our exact stack:
Astro `output: "static"` + `@astrojs/cloudflare` + Paraglide JS 2 (`@inlang/paraglide-js`).
Date: 2026-07-14.

## Decision

**Pure path-prefix `/[locale]/…` for every locale, base locale included.** No domain-per-locale, no
hybrid. One static build serves all locales off the `.se` zone. A future `.com` is bought purely for
brand capture and does a **dumb 301 → `.se`** at the Cloudflare edge; it carries no locale meaning.

```
joyofcreativity.se/sv/…      ← Swedish (base)
joyofcreativity.se/en/…      ← English
joyofcreativity.se/de/…      ← later, no schema change
joyofcreativity.se/fr/…      ← later, no schema change
joyofcreativity.se/          → 301 /sv/   (redirectToDefaultLocale)
joyofcreativity.com/*        → 301 joyofcreativity.se/*   (Cloudflare Redirect Rule)
```

This supersedes the hybrid shape that the #46 grilling had tentatively favoured (`.se`=sv root,
`.com`=en, others under `.com/[locale]`). Rationale for the reversal — from the effort owner:
**TLD-based locale routing is too fragile and complex for this case.** The research below confirms
the concrete reason it is *structurally* wrong for us, not just a matter of taste.

## Why not TLD-based (`i18n.domains`) — the disqualifier

Astro's `i18n.domains` (map a locale to its own apex domain) **requires `output: "server"`**:
a static build cannot inspect the `Host` header at request time, so the routing can only happen on
an on-demand server. Astro's docs state `domains` is for `server` rendered projects only, on a
server adapter.

That collides head-on with two decisions already locked on this map:

- **Server surface & rendering architecture (#29)** — stays `output: "static"`, with
  `prerender = false` on *only* the transactional routes. Going `output: "server"` to satisfy
  `domains` would flip the whole content site to on-demand rendering.
- **Content localization strategy (#45)** — git-authored Content Collections rendered as **static**
  localized pages, `getStaticPaths()` emitting only curated `(locale, product)` pairs.

So domain-per-locale doesn't just "add complexity" — it would force the entire storefront off the
static rails that #29/#45 deliberately chose, for zero user-visible benefit over a path prefix. It
is ruled out.

(A `.com` still gets bought — for brand/typo capture — but as a redirect target, which needs no
app-level routing at all. See "The `.com` redirect" below.)

## The path-prefix build — concrete config

### 1. `prefixDefaultLocale: true` (symmetric `/[locale]/`)

To get `/[locale]/` on **every** locale (including `sv`), Astro's built-in i18n needs
`prefixDefaultLocale: true`, plus `redirectToDefaultLocale: true` so the bare root redirects to the
base locale.

```js
// astro.config.mjs
import cloudflare from "@astrojs/cloudflare";
import preact from "@astrojs/preact";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { defineConfig } from "astro/config";
import { baseLocale, locales } from "./src/i18n/runtime";

export default defineConfig({
  output: "static",
  integrations: [preact()],
  i18n: {
    defaultLocale: baseLocale,          // "sv"
    locales: [...locales],              // ["sv", "en", …]
    routing: {
      prefixDefaultLocale: true,        // /sv/… as well as /en/…
      redirectToDefaultLocale: true,    // /  → /sv/
    },
  },
  vite: {
    resolve: { tsconfigPaths: true },
    plugins: [
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/i18n",
        strategy: ["url", "globalVariable", "baseLocale"],
        urlPatterns: [
          {
            pattern: "/:path(.*)?",
            localized: [
              // NO trailing slash on the localized patterns (see pitfalls)
              ["sv", "/sv/:path(.*)?"],
              ["en", "/en/:path(.*)?"],
            ],
          },
        ],
      }),
    ],
  },
  adapter: cloudflare({}),
});
```

Notes on the Paraglide options (verified against the Paraglide SSG guide):

- **`strategy: ["url", "globalVariable", "baseLocale"]`.** `url` reads the locale from the path.
  `globalVariable` **must come before `baseLocale`** so that `setLocale()` can store the locale
  during static rendering (there is no request/cookie at build time). `baseLocale` is the final
  fallback. This replaces the current `["baseLocale"]`-only (single-locale) strategy.
- **`urlPatterns`** are given explicitly and **without trailing slashes**, which is the documented
  fix for the trailing-slash redirect loop this project hit before (see pitfalls note). Because we
  prefix the base locale too, `sv` gets an explicit pattern rather than the bare-root default.

### 2. Set the locale per page at build time — middleware, **not** `paraglideMiddleware`

For SSG you must **not** use `paraglideMiddleware()` (it de-localizes request URLs for on-demand
SSR; static pages instead need Astro to render each localized path directly). Instead a tiny Astro
middleware runs per page at build time and hands Astro's resolved locale to Paraglide:

```ts
// src/middleware.ts
import { defineMiddleware } from "astro:middleware";
import { assertIsLocale, baseLocale, setLocale } from "@/i18n/runtime";

export const onRequest = defineMiddleware((context, next) => {
  // Astro derives context.currentLocale from the first path segment
  // (matched against i18n.locales). Paraglide chrome strings follow it.
  setLocale(assertIsLocale(context.currentLocale ?? baseLocale), { reload: false });
  return next();
});
```

This is the seam between the two "routers": **Astro i18n owns URL→locale**, and Paraglide is set
from it so `m.*()` chrome strings resolve — exactly the "Paraglide = chrome only" split from #45.

### 3. Routes: a `[locale]` param folder, driven by `getStaticPaths()`

The curated-pairs rule from #45 (`getStaticPaths()` emits only real `(locale, product)` pairs →
natural 404 for uncurated ones) fits a `[locale]` dynamic segment better than physical `src/pages/sv/`
+ `src/pages/en/` folders. Move the existing pages under `src/pages/[locale]/`:

```
src/pages/[locale]/index.astro
src/pages/[locale]/cart.astro
src/pages/[locale]/category/[id]/[slug].astro
src/pages/[locale]/product/[id]/[slug].astro
src/pages/404.astro                       ← stays locale-agnostic at root
```

- **Non-catalog pages** (`index`, `cart`) emit one path per configured locale:
  ```ts
  export const getStaticPaths = () => locales.map((locale) => ({ params: { locale } }));
  ```
- **Catalog pages** (`product`, `category`) emit only the **curated** `(locale, id, slug)` triples
  per #45 — the resolver joins structural `id` + localized Content Collection content; uncurated
  combinations are simply never emitted and 404 naturally.
- `Astro.currentLocale` resolves inside these pages because the first path segment is a configured
  locale — no manual parsing of the `[locale]` param needed for Paraglide.

### 4. The `/` → `/sv/` redirect

With `redirectToDefaultLocale: true`, Astro generates the root redirect. On the Cloudflare adapter a
static-output redirect is emitted to the platform's `_redirects` file, so `/` → `/sv/` is served as
an edge 301 with no SSR. (If we ever want it explicit/independent of the i18n option, an Astro
`redirects: { "/": "/sv/" }` entry produces the same `_redirects` line.)

### 5. The `.com` redirect

`joyofcreativity.com` → `joyofcreativity.se` is **not** an app concern. Buy the domain, put it on
the same Cloudflare account, and add a single **Redirect Rule** (or Bulk Redirect):
`*.com/*` → `https://joyofcreativity.se/${1}` with a 301, preserving path + query. It carries no
locale semantics; `en` lives at `.se/en/`, same as every other non-base locale.

## What must become non-static?

**Nothing new.** The whole point of dropping `domains` is that path-prefix i18n is fully static:

- Content/catalog pages stay `output: "static"` / prerendered, exactly as #29 and #45 assumed.
- Only the transactional routes already carry `prerender = false` (#29) — unchanged by this decision.
- The two redirects (`/`→`/sv/`, `.com`→`.se`) are edge/CDN redirects, not server renders.

## Pitfalls already hit in this repo — and why they're mostly mooted

The project previously hit Paraglide url-strategy pain (recorded in the paraglide-url-strategy
pitfalls note), on a **TanStack Start + Cloudflare** setup — not Astro. Mapping each to this Astro
SSG design:

- **Trailing-slash redirect loop → dev freeze.** Was caused by `paraglideMiddleware` 307-redirecting
  to a trailing-slash localized root while the framework stripped it. Here we **don't run
  `paraglideMiddleware` at all** (SSG), and the `urlPatterns` are declared **without trailing
  slashes**. Keep Astro `trailingSlash`/`build.format` consistent with the no-slash patterns.
- **Chrome `.well-known/appspecific/com.chrome.devtools.json` 404 spam.** That was noise from an
  **SSR** 404 handler logging on every probe. A static site just serves a static 404 for it — no SSR
  log, non-issue. (`src/pages/404.astro` already exists.)
- **`url` strategy needed an SSR Worker entrypoint + router rewrite.** That was the TanStack
  requirement. In Astro SSG the equivalent is the small `src/middleware.ts` above running at build
  time; no custom Worker entrypoint.

## Lock-in / migration trade-off (vs the standing "thin, boring, low-lock-in" constraint)

- **On-the-rails.** Path-prefix i18n is Astro's *native* routing plus Paraglide's *documented* SSG
  mode — no bespoke routing machinery (the DIY "one build, Cloudflare rewrites `.se`→`sv` assets"
  alternative from the #46 brief is **not** taken; it would be custom edge logic to maintain). This
  is the lowest-lock-in of the three options considered.
- **Migration-friendly.** `/[locale]/path` is the near-universal convention for off-the-shelf
  commerce platforms (Shopify Markets, most headless setups), so a future migration inherits the
  same URL shape — no locale-URL breakage, no per-locale domain DNS to untangle.
- **SEO.** Path-prefix with a self-referencing `hreflang` set per page is standard and well-indexed;
  a single strong `.se` origin concentrates authority rather than splitting it across TLDs.
- **Cost.** Zero new infra; no `output: "server"` (which `domains` would have forced), so no
  always-on server cost — respects the "no monthly subscription" constraint.

## Follow-on (fog this clears / raises)

- **`hreflang` + canonical tags** across localized pages, and a locale switcher in chrome that maps
  the current path across locales (`localizeHref()` from Paraglide). Small, mechanical — belongs to
  build/execution, not a decision.
- **Base-locale URL migration.** Today content is served unprefixed at `/`; moving to `/sv/…` means
  old `/` deep-links should 301 to `/sv/…`. For a pre-launch site with no external inbound links this
  is a non-issue; noted for completeness.
- The **transactional-flow localization** fog line on the map (which locale drives the Stripe embed,
  VAT/legal copy, confirmation-email locale) is unaffected by this and remains open — it keys off the
  order's checkout-locale snapshot (#45), and the checkout routes read `Astro.currentLocale` the same
  way as content pages.

## Sources

- Astro — Internationalization (i18n) routing, `prefixDefaultLocale`, `redirectToDefaultLocale`,
  `domains` requires `output: "server"`: <https://docs.astro.build/en/guides/internationalization/>
- Paraglide JS — Static Site Generation (SSG) with Astro (`strategy` order incl. `globalVariable`,
  `urlPatterns`, `setLocale` in middleware, "do not use `paraglideMiddleware()` for SSG"):
  <https://github.com/opral/paraglide-js/blob/main/docs/static-site-generation.md>
- Paraglide JS — Strategy & url `urlPatterns`: <https://paraglidejs.com/strategy>
- Paraglide JS — Astro example: <https://github.com/opral/paraglide-js/tree/main/examples/astro>
