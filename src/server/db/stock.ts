import { eq, inArray } from "drizzle-orm";
import { Data, Effect } from "effect";
import type { StockSnapshot } from "@/libs/blank.types";
import { getProductById } from "@/libs/product";
import { Database } from "./client";
import { stock } from "./schema";

/**
 * A D1 read failed. The structured error channel ADR-0014 chose Effect for: a
 * caller sees a typed infrastructure failure, not a thrown value it has to
 * guess at.
 */
export class StockReadError extends Data.TaggedError("StockReadError")<{
  readonly cause: unknown;
}> {}

/**
 * No product family has this id. Distinct from {@link StockReadError} so the
 * Action boundary can map it to a 404 (a caller's bad id) rather than a 500 (an
 * infrastructure fault) — the same typed-failure discipline ADR-0014 asks for.
 */
export class ProductNotFoundError extends Data.TaggedError(
  "ProductNotFoundError",
)<{
  readonly productId: string;
}> {}

/**
 * Read on-hand stock for a single Blank (ADR-0014: an `Effect.gen` program that
 * declares the {@link Database} requirement, run by the caller with the D1 layer
 * provided). `undefined` means "no row" — distinct from a row of `0` — so a
 * caller can tell an unknown Blank from a sold-out one. The availability engine
 * (#58) treats both as zero, but the distinction is real at this layer.
 */
export const getOnHand = (
  blankId: string,
): Effect.Effect<number | undefined, StockReadError, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;
    const row = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ onHand: stock.onHand })
          .from(stock)
          .where(eq(stock.blankId, blankId))
          .get(),
      catch: (cause) => new StockReadError({ cause }),
    });
    return row?.onHand;
  });

/**
 * Read on-hand stock for a set of Blanks in one query, as the
 * {@link StockSnapshot} the isomorphic engines evaluate against (#58, #62). This
 * is the server read path a `getStock` Action feeds to the configurator today
 * and the checkout boundary will reuse to re-check availability the shop
 * controls, not a client-supplied number.
 *
 * A Blank with no row is simply absent from the map — the engines treat an
 * absent Blank as zero on-hand, so an unknown and a sold-out Blank collapse to
 * the same "not available" the way {@link getOnHand}'s `undefined`/`0` do not.
 * An empty input short-circuits without touching D1.
 */
export const getOnHandForBlanks = (
  blankIds: readonly string[],
): Effect.Effect<StockSnapshot, StockReadError, Database> =>
  Effect.gen(function* () {
    if (blankIds.length === 0) {
      return new Map();
    }
    const db = yield* Database;
    const rows = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ blankId: stock.blankId, onHand: stock.onHand })
          .from(stock)
          .where(inArray(stock.blankId, [...blankIds]))
          .all(),
      catch: (cause) => new StockReadError({ cause }),
    });
    return new Map(rows.map((row) => [row.blankId, row.onHand] as const));
  });

/**
 * Live stock for a whole product family (#62): resolve the family's offered
 * blanks (isomorphic catalogue, `getProductById`) and read their on-hand as one
 * {@link StockSnapshot}. This is the resolve-then-read the `getStock` Action
 * drives today and the checkout boundary reuses, so the Action stays a thin
 * validate-and-delegate boundary (ADR-0013) with no catalogue logic of its own.
 * Fails with {@link ProductNotFoundError} for an unknown family.
 */
export const getStockForProduct = (
  productId: string,
): Effect.Effect<
  StockSnapshot,
  StockReadError | ProductNotFoundError,
  Database
> =>
  Effect.gen(function* () {
    const product = getProductById(productId);
    if (!product) {
      return yield* Effect.fail(new ProductNotFoundError({ productId }));
    }
    return yield* getOnHandForBlanks(
      product.blanks.map((blank) => blank.blankId),
    );
  });
