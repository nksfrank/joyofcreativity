import { ActionError, defineAction } from "astro:actions";
// Astro's `defineAction` input is typed to zod's own schema type, so this one
// boundary uses `astro/zod` (which re-exports the zod Astro already ships).
// Everything past this line is Effect + effect/Schema (ADR-0014).
import { env } from "cloudflare:workers";
import { z } from "astro/zod";
import { Cause, Effect, Exit, Layer, Schema } from "effect";
import { isParseError, TreeFormatter } from "effect/ParseResult";
import { validateCheckout } from "@/server/checkout/checkout";
import { quoteSignerFromEnv } from "@/server/checkout/checkout.env";
import { SignedQuoteSchema } from "@/server/checkout/quote";
import { createCheckoutSession } from "@/server/checkout/session";
import { createDb, Database } from "@/server/db/client";
import { getStockForProduct } from "@/server/db/stock";
import { greet, ServerEnv } from "@/server/greeting";
import { layerFromEnv as stripeFromEnv } from "@/server/stripe.env";

/**
 * The island-facing RPC surface (ADR-0013). The zod `input` here guards only
 * the wire shape Astro's `defineAction` forces (ADR-0014); the real domain
 * validation is `effect/Schema` inside `src/server/`. Each Action hands off to
 * an Effect program there, providing the Cloudflare env — read from
 * `cloudflare:workers` — as a Layer. This boundary is where cross-cutting
 * policies (retry, timeout, rate-limiting) would compose over the program.
 */
export const server = {
  greet: defineAction({
    input: z.object({
      name: z.string(),
    }),
    handler: async ({ name }) => {
      const runtimeEnv = Layer.succeed(ServerEnv, {
        SERVER_SURFACE_GREETING: env.SERVER_SURFACE_GREETING,
      });

      const exit = await Effect.runPromiseExit(
        Effect.provide(greet(name), runtimeEnv),
      );

      if (Exit.isSuccess(exit)) {
        return exit.value;
      }

      // A Schema decode error on `name` is a client mistake → bad request with
      // its message. Any other failure (a defect, or a future typed error the
      // handler doesn't yet translate) must not masquerade as a 400.
      const failure = Cause.failureOption(exit.cause);
      if (failure._tag === "Some" && isParseError(failure.value)) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: TreeFormatter.formatErrorSync(failure.value),
        });
      }
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Greeting failed unexpectedly",
      });
    },
  }),

  /**
   * Live stock for a product family (#62): the configurator calls this once on
   * mount to feed the `ConfigurationModel`'s snapshot from D1 — the store the
   * shop controls — rather than a code constant. Thin boundary (ADR-0013): the
   * resolve-then-read lives in `getStockForProduct`; this only validates the wire
   * shape, provides the D1 layer from the `DB` binding, and translates failures.
   *
   * The snapshot is advisory (ADR-0003): the client still prices and feasibility-
   * checks instantly against it, so there is no server round-trip per selection.
   * The returned `Map<blankId, onHand>` is what `StockSnapshot` consumes verbatim.
   */
  getStock: defineAction({
    input: z.object({
      productId: z.string(),
    }),
    handler: async ({ productId }) => {
      const dbLayer = Layer.succeed(Database, createDb(env.DB));

      const exit = await Effect.runPromiseExit(
        Effect.provide(getStockForProduct(productId), dbLayer),
      );

      if (Exit.isSuccess(exit)) {
        return exit.value;
      }

      // An unknown product is the caller's bad id → 404; a StockReadError (or any
      // other failure) is infrastructure → 500. Same `Cause.failureOption`
      // translation shape as `greet`.
      const failure = Cause.failureOption(exit.cause);
      if (
        failure._tag === "Some" &&
        failure.value._tag === "ProductNotFoundError"
      ) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: `Unknown product ${productId}`,
        });
      }
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to read stock",
      });
    },
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
    handler: async (request) => {
      const layer = Layer.merge(
        Layer.succeed(Database, createDb(env.DB)),
        quoteSignerFromEnv(),
      );

      const exit = await Effect.runPromiseExit(
        Effect.provide(validateCheckout(request, Date.now()), layer),
      );

      if (Exit.isSuccess(exit)) {
        return exit.value;
      }

      // A Schema decode error is a malformed cart → bad request; a StockReadError
      // (or any other failure) is infrastructure → 500. Same translation shape as
      // the other Actions.
      const failure = Cause.failureOption(exit.cause);
      if (failure._tag === "Some" && isParseError(failure.value)) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: TreeFormatter.formatErrorSync(failure.value),
        });
      }
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to validate checkout",
      });
    },
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
    handler: async ({ quote, returnUrl }) => {
      const layer = Layer.mergeAll(
        Layer.succeed(Database, createDb(env.DB)),
        quoteSignerFromEnv(),
        stripeFromEnv(),
      );

      // Decode the carried quote through the shared schema (parse, don't cast),
      // then commit. A malformed quote is a `ParseError` → 400; the HMAC verify
      // inside `createCheckoutSession` still re-establishes authority regardless.
      const program = Schema.decodeUnknown(SignedQuoteSchema)(quote).pipe(
        Effect.flatMap((decoded) =>
          createCheckoutSession(decoded, returnUrl, Date.now()),
        ),
      );
      const exit = await Effect.runPromiseExit(Effect.provide(program, layer));

      if (Exit.isSuccess(exit)) {
        return exit.value;
      }

      // A decode error is a malformed quote → 400; every typed failure
      // (StockReadError, OrderWriteError, StripeError) is infrastructure → 500.
      // The customer-facing blocks are successful results, not failures. Same
      // translation shape as the other Actions.
      const failure = Cause.failureOption(exit.cause);
      if (failure._tag === "Some" && isParseError(failure.value)) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: TreeFormatter.formatErrorSync(failure.value),
        });
      }
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create checkout session",
      });
    },
  }),
};
