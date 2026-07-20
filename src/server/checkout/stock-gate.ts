import { Effect } from "effect";
import type { StockSnapshot } from "@/libs/blank.types";
import { onHand } from "@/libs/blank.utils";
import type { Database } from "@/server/db/client";
import { getOnHandForBlanks, type StockReadError } from "@/server/db/stock";

/**
 * The one place the "does live on-hand cover this quantity?" rule lives (#54
 * architecture review, candidate 1). Both authoritative checkpoints —
 * `validateCheckout`'s bucket-3 check and `createCheckoutSession`'s TOCTOU gate —
 * ask the same question of the same D1 read path, so it is answered here once
 * rather than re-implemented per caller. Quantity-aware, on top of the `onHand`
 * primitive (`blank.utils`) so the "absent blank = zero" default is shared with
 * the availability engine and the configurator.
 *
 * A *check*, never a hold: stock is neither reserved nor decremented (#34/#35).
 */

/** A line the gate can weigh: just the blank and how many are wanted. */
export type StockLine = {
  readonly blankId: string;
  readonly quantity: number;
};

/** Pure: the indices of the lines this snapshot does not cover. */
export const shortfallsIn = (
  lines: readonly StockLine[],
  snapshot: StockSnapshot,
): number[] =>
  lines.flatMap((line, index) =>
    onHand(snapshot, line.blankId) < line.quantity ? [index] : [],
  );

/**
 * Read live on-hand for the lines' blanks (deduped) and return the indices the
 * current count no longer covers. The Effect wrapper the checkpoints run; the
 * pure {@link shortfallsIn} is what unit tests exercise with a hand-built snapshot.
 */
export const readShortfalls = (
  lines: readonly StockLine[],
): Effect.Effect<number[], StockReadError, Database> =>
  Effect.gen(function* () {
    const blankIds = [...new Set(lines.map((line) => line.blankId))];
    const snapshot = yield* getOnHandForBlanks(blankIds);
    return shortfallsIn(lines, snapshot);
  });
