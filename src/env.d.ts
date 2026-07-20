type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

/**
 * The Stripe *publishable* key (`pk_test_…`), read client-side to load Stripe.js
 * and mount the embedded Checkout (#65). Unlike the secret key it is safe in the
 * browser by design, so it rides the `PUBLIC_` env prefix (Astro inlines it into
 * the client bundle) rather than a Workers secret. Optional so a build without it
 * still type-checks; the embed shows a graceful "unavailable" if it is missing.
 */
interface ImportMetaEnv {
  readonly PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
}
