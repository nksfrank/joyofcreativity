import { ActionError, defineAction } from "astro:actions";
// Astro's `defineAction` input is typed to zod's own schema type, so this one
// boundary uses `astro/zod` (which re-exports the zod Astro already ships).
// Everything past this line is Effect + effect/Schema (ADR-0014).
import { env } from "cloudflare:workers";
import { z } from "astro/zod";
import { Effect, Layer, Schema } from "effect";
import { isParseError, TreeFormatter } from "effect/ParseResult";
import { validateCheckout } from "@/server/checkout/checkout";
import { quoteSignerFromEnv } from "@/server/checkout/checkout.env";
import { SignedQuoteSchema } from "@/server/checkout/quote";
import { createCheckoutSession } from "@/server/checkout/session";
import { createDb, Database } from "@/server/db/client";
import { getStockForProduct } from "@/server/db/stock";
import { layerFromEnv as stripeFromEnv } from "@/server/stripe.env";
import { runAction } from "./run-action";

/**
 * The island-facing RPC surface (ADR-0013). The zod `input` here guards only
 * the wire shape Astro's `defineAction` forces (ADR-0014); the real domain
 * validation is `effect/Schema` inside `src/server/`. Each Action builds the
 * per-invocation env layer — read from `cloudflare:workers` — and hands its
 * Effect program to `runAction`, the one adapter that runs the program and
 * translates a typed failure to an `ActionError` (and the single home for
 * cross-cutting policies like retry/timeout/rate-limiting).
 */
export const server = {
  /**
   * Live stock for a product family (#62): the configurator calls this once on
   * mount to feed the `ConfigurationModel`'s snapshot from D1 — the store the
   * shop controls — rather than a code constant. Thin boundary (ADR-0013): the
   * resolve-then-read lives in `getStockForProduct`; this only validates the wire
   * shape, provides the D1 layer from the `DB` binding, and maps failures.
   *
   * The snapshot is advisory (ADR-0003): the client still prices and feasibility-
   * checks instantly against it, so there is no server round-trip per selection.
   * The returned `Map<blankId, onHand>` is what `StockSnapshot` consumes verbatim.
   */
  getStock: defineAction({
    input: z.object({
      productId: z.string(),
    }),
    // An unknown product is the caller's bad id → 404; a StockReadError (or any
    // other failure) is infrastructure → 500.
    handler: ({ productId }) =>
      runAction(
        getStockForProduct(productId),
        Layer.succeed(Database, createDb(env.DB)),
        {
          translate: (failure) =>
            failure._tag === "ProductNotFoundError"
              ? new ActionError({
                  code: "NOT_FOUND",
                  message: `Unknown product ${productId}`,
                })
              : undefined,
          fallbackMessage: "Failed to read stock",
        },
      ),
  }),

  /**
   * The first authoritative checkpoint (#64, trust boundary #33). The client
   * POSTs a trust-minimal cart — `{ productId, item, quantity }[]`, no price and
   * no display — and the server re-prices it with the shared engines, re-checks
   * every line against the catalog and live D1 stock, and returns either all
   * problems at once (four buckets) or a signed quote (the price lock, ADR-0016).
   *
   * Thin boundary (ADR-0013): the zod `input` guards only the wire shape; the
   * real domain validation, pricing, and signing live in `validateCheckout`. Two
   * layers are provided per-invocation from `env` — the D1 `Database` and the
   * live `QuoteSigner` over the `QUOTE_SIGNING_KEY` secret.
   */
  validateCheckout: defineAction({
    input: z.object({
      lines: z.array(
        z.object({
          productId: z.string(),
          item: z.object({
            blankId: z.string(),
            patternId: z.string(),
            yarnColorIds: z.array(z.string()),
            customisation: z.string(),
          }),
          quantity: z.number(),
        }),
      ),
    }),
    // A Schema decode error is a malformed cart → bad request; a StockReadError
    // (or any other failure) is infrastructure → 500.
    handler: (request) =>
      runAction(
        validateCheckout(request, Date.now()),
        Layer.merge(
          Layer.succeed(Database, createDb(env.DB)),
          quoteSignerFromEnv(),
        ),
        {
          translate: (failure) =>
            isParseError(failure)
              ? new ActionError({
                  code: "BAD_REQUEST",
                  message: TreeFormatter.formatErrorSync(failure),
                })
              : undefined,
          fallbackMessage: "Failed to validate checkout",
        },
      ),
  }),

  /**
   * The second authoritative checkpoint and the shop's first written-down order
   * (#65, transact+fulfil #54). The client carries back the signed quote from
   * `validateCheckout`; the server re-verifies it into a branded `VerifiedQuote`
   * (ADR-0017 — trust is re-derived here, never taken from the client),
   * re-checks live D1 stock (TOCTOU), persists a `pending` order, opens Stripe's
   * embedded Checkout from the *locked* prices, and returns the `client_secret`
   * the island mounts.
   *
   * Thin boundary (ADR-0013): the zod `input` guards only the wire shape — a
   * forged price here is stripped and, more to the point, never trusted, since
   * only the HMAC-verified quote drives the order and the charge. Three layers
   * are provided per-invocation from `env`: the D1 `Database`, the live
   * `QuoteSigner` (`QUOTE_SIGNING_KEY`), and the live `Stripe` port
   * (`STRIPE_SECRET_KEY`). `quote_invalid` / `out_of_stock` are normal customer
   * outcomes returned in the payload; only an infrastructure fault is a 500.
   */
  createCheckoutSession: defineAction({
    // The zod `input` guards only the wire shape Astro forces (ADR-0014): the
    // quote is passed through as `unknown` and decoded by the one source of the
    // quote's shape — `SignedQuoteSchema` — inside the Effect program below, so
    // there is no hand-maintained schema mirror and no `as SignedQuote` cast
    // (#54 architecture review, candidate 2).
    input: z.object({
      quote: z.unknown(),
      returnUrl: z.url(),
    }),
    // Decode the carried quote through the shared schema (parse, don't cast),
    // then commit. A `ParseError` from a malformed quote is a bad request → 400;
    // every other typed failure (StockReadError, OrderWriteError, StripeError) is
    // infrastructure → 500. The customer-facing blocks (quote_invalid,
    // out_of_stock) are successful results, not failures. The HMAC verify inside
    // `createCheckoutSession` re-establishes authority regardless of the decode.
    handler: ({ quote, returnUrl }) =>
      runAction(
        Schema.decodeUnknown(SignedQuoteSchema)(quote).pipe(
          Effect.flatMap((decoded) =>
            createCheckoutSession(decoded, returnUrl, Date.now()),
          ),
        ),
        Layer.mergeAll(
          Layer.succeed(Database, createDb(env.DB)),
          quoteSignerFromEnv(),
          stripeFromEnv(),
        ),
        {
          translate: (failure) =>
            isParseError(failure)
              ? new ActionError({
                  code: "BAD_REQUEST",
                  message: TreeFormatter.formatErrorSync(failure),
                })
              : undefined,
          fallbackMessage: "Failed to create checkout session",
        },
      ),
  }),
};
