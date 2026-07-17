# 12. CI/CD on GitHub Actions, deploying to Cloudflare Workers

Status: Accepted

## Context

The repo had no CI/CD. It lives on GitHub (`nksfrank/joyofcreativity`) and deploys to
Cloudflare Workers via the `@astrojs/cloudflare` adapter and `wrangler deploy`. `main` is the
default branch and is protected (`enforce_admins: true`, PRs required) — direct pushes are
impossible even for the owner. The project is a solo effort right now.

Quality gates available: `biome check` (lint+format), `astro check` (types), `vitest` (pure
pricing/availability engines) and `playwright` e2e (full product journeys). The e2e suite boots
a real dev server and has a known parallel cold-start flake (issue #19). The paraglide i18n
output (`src/i18n/`) is generated at build time, not committed.

## Decision

Orchestrate everything with **GitHub Actions**, in two workflows:

- **`pr.yml`** (on `pull_request` → `main`): `npm ci` → `npm run i18n` → `npm run check` →
  `npm test`. Registered as a **required status check** on `main`.
- **`deploy.yml`** (on `push` → `main`): `npm ci` → `npm run build` →
  `cloudflare/wrangler-action` `deploy`. Auth via `CLOUDFLARE_API_TOKEN` /
  `CLOUDFLARE_ACCOUNT_ID` repo secrets.

Supporting choices:

- **Trunk-based, single environment.** `main` deploys straight to production; no persistent
  staging Worker. As a solo dev the second tier buys little, and Cloudflare bills Workers
  per-account (pooled requests/CPU), so a staging Worker would be near-free but still
  unjustified overhead today.
- **e2e (Playwright) is deliberately excluded from CI** and run locally on demand. The pure
  engines — the real domain logic — are covered by `vitest` in CI; Playwright covers
  integration journeys but pays a flake-tax (issue #19) that would gate every merge for the
  sole reviewer with little added confidence.
- **Deploy trusts the PR gate** rather than re-running checks, which is safe because branch
  protection guarantees everything reaching `main` passed a PR.
- **`src/i18n/` is gitignored** as generated output (like `dist/` and `.astro/`) and
  regenerated in CI, removing a works-locally/absent-in-CI trap.

## Consequences

- A fast PR gate (~1–2 min) blocks merges to `main`; production only ever receives PR-gated code.
- No staging URL to exercise deployed journeys against — acceptable at solo scale, revisit if
  contributors join.
- e2e regressions are caught locally, not by CI. A future contributor may be surprised e2e is
  absent from the pipeline; that is intentional, not an oversight.
- Deploys require the Cloudflare secrets to be present; the deploy workflow fails loudly until
  they are added.

## Rejected alternatives

- **Cloudflare Workers Builds (Git-connected deploy)** — free per-PR preview URLs, but build
  logic lives in the dashboard rather than the repo, and wiring the existing biome/vitest gate
  into the deploy path is awkward. Keeping the whole pipeline as reviewable in-repo YAML won.
- **`develop` → staging, `main` → production** — a real second environment, rejected as
  premature for a solo dev who wants minimal CI wait time.
- **e2e on every PR** — highest confidence, rejected because the cold-start flake would
  repeatedly block merges for no reviewer benefit beyond the unit suite.
