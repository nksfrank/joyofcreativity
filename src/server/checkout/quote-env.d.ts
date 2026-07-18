// Ambient augmentation: declare the quote-signing secret on the Cloudflare env so
// `env.QUOTE_SIGNING_KEY` (read in `checkout.env.ts`) is typed (#64). It is the
// one new Workers *secret* this effort adds — set via `.dev.vars` locally /
// `wrangler secret put QUOTE_SIGNING_KEY` in production — so, unlike
// `wrangler.jsonc`'s committed `vars`, it is not emitted into the generated
// `worker-configuration.d.ts` by `cf-typegen`. Declaring it here interface-merges
// it into the generated `Cloudflare.Env` (the type of `cloudflare:workers`' `env`)
// without the committed types drifting on whether a local `.dev.vars` existed at
// type-gen time. The filename avoids the `checkout.env.d.ts` form so TypeScript
// does not pair it with `checkout.env.ts` and skip its ambient declarations.
declare namespace Cloudflare {
  interface Env {
    QUOTE_SIGNING_KEY: string;
  }
}
