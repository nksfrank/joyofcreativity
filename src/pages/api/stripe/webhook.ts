import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { layerFromEnv } from "@/server/stripe.env";
import { handleStripeWebhook } from "@/server/stripe-webhook";

/**
 * The Stripe webhook endpoint (issue #66). It is a raw-body **API route**, not
 * an Astro Action, because signature verification needs the unparsed request
 * body and Web Crypto on Workers is async (ADR-0013) — an Action's JSON-decoding
 * surface cannot give the exact signed bytes.
 *
 * `prerender = false` opts this route into on-demand rendering; a forgotten flag
 * fails safe by staying static (ADR-0013). The env is read per-invocation from
 * `import { env } from "cloudflare:workers"` — the repo's env boundary
 * (ADR-0013/0014): `Astro.locals.runtime.env` was removed in this adapter
 * version and throws, despite the ticket's wording. The SDK key stays behind the
 * single `layerFromEnv()` seam (ADR-0015); this route reads only the webhook
 * signing secret directly. The handler in `src/server/` owns the raw-body read,
 * verification, and the 200/400 mapping; this route only wires env and delegates.
 */
export const prerender = false;

export const POST: APIRoute = ({ request }) =>
  handleStripeWebhook(request, {
    stripe: layerFromEnv(),
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  });
