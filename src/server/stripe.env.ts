import { env } from "cloudflare:workers";
import type { Layer } from "effect";
import { layer, type Stripe } from "./stripe";

/**
 * The live {@link Stripe} port wired to the running Worker's env (issue #61).
 *
 * Call this **inside a request handler** — an Action, later the webhook route —
 * never at module scope, so the test-mode secret is read per-invocation from
 * `import { env } from "cloudflare:workers"` (ADR-0013/0014). This is the single
 * place the SDK is fed a real key. Unit tests provide `makeFakeStripe()` instead
 * and never import this module, which keeps `cloudflare:workers` out of the test
 * path (mirroring how `src/actions/` is the env boundary and `src/server/`'s pure
 * logic stays runnable under plain Vitest).
 */
export const layerFromEnv = (): Layer.Layer<Stripe> =>
  layer(env.STRIPE_SECRET_KEY);
