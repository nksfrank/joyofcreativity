// Ambient augmentation: declare the Stripe test-mode secret on the Cloudflare
// env so `env.STRIPE_SECRET_KEY` (read in `stripe.env.ts`) is typed (issue #61).
// It is a *secret* (`sk_test_…`), set via `.dev.vars` locally / `wrangler secret`
// in production, so — unlike `wrangler.jsonc`'s committed `vars` — it is not
// emitted into the generated `worker-configuration.d.ts` by `cf-typegen`.
// Declaring it here (it interface-merges into the generated `Cloudflare.Env`,
// the type of `cloudflare:workers`' `env`) keeps the binding typed without the
// committed types drifting on whether a local `.dev.vars` existed at type-gen
// time. The filename deliberately avoids the `stripe.env.d.ts` form so TypeScript
// does not pair it with `stripe.env.ts` and skip its ambient declarations.
// The webhook signing secret (`whsec_…`, issue #66) is likewise a secret — set
// via `.dev.vars` / `wrangler secret`, never a committed `var` — so it is
// declared here for the same reason, read in the webhook API route.
declare namespace Cloudflare {
  interface Env {
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
  }
}
