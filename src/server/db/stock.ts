import { eq } from "drizzle-orm";
import { Data, Effect } from "effect";
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
