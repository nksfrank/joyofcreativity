import { env } from "cloudflare:workers";
import type { Layer } from "effect";
import { makeQuoteSigner, type QuoteSigner } from "./quote";

/**
 * The live {@link QuoteSigner} layer wired to the running Worker's env (#64).
 *
 * Call this **inside a request handler** — the `validateCheckout` Action, later
 * the commit route — never at module scope, so the one new Workers secret
 * (`QUOTE_SIGNING_KEY`) is read per-invocation from `import { env } from
 * "cloudflare:workers"` (ADR-0013/0014). This is the single place the signing
 * key is read; unit tests build `makeQuoteSigner("…")` over a literal key instead
 * and never import this module, keeping `cloudflare:workers` out of the test path
 * (mirroring `stripe.env.ts`).
 */
export const quoteSignerFromEnv = (): Layer.Layer<QuoteSigner> =>
  makeQuoteSigner(env.QUOTE_SIGNING_KEY);
