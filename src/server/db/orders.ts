import type { BatchItem } from "drizzle-orm/batch";
import { Data, Effect } from "effect";
import type { CurrencyCode, Price } from "@/libs/money";
import type { ProductOrderItem } from "@/libs/product.types";
import { Database } from "./client";
import { orderItems, orders } from "./schema";

/**
 * A D1 write failed while persisting an order. The structured error channel
 * ADR-0014 chose Effect for — a caller (the Action boundary) sees a typed
 * infrastructure failure to map to a 500, not a thrown value it must guess at.
 * Mirrors {@link import("./stock").StockReadError} on the read side.
 */
export class OrderWriteError extends Data.TaggedError("OrderWriteError")<{
  readonly cause: unknown;
}> {}

/** One snapshotted line of a pending order: frozen config + server-locked price. */
export type PendingOrderLine = {
  readonly productId: string;
  readonly item: ProductOrderItem;
  readonly quantity: number;
  /**
   * The server-locked unit {@link Price} — currency and all. The money value
   * crosses the seam intact and only degrades to a bare minor-unit column inside
   * {@link insertPendingOrder}, so a caller never hand-strips currency here (#54
   * architecture review, candidate 4).
   */
  readonly unitPrice: Price;
  /** Human-readable line label captured for the receipt. */
  readonly display: string;
};

/** A `pending` order ready to be written: ULID/UUIDv7 id, single currency, snapshotted lines. */
export type PendingOrder = {
  readonly id: string;
  readonly currency: CurrencyCode;
  readonly createdAt: number;
  readonly lines: readonly PendingOrderLine[];
};

/**
 * Persist a `pending` order and its snapshotted lines (#65) in one atomic D1
 * `batch` — the order row and every line commit together or not at all, so no
 * caller can ever observe an order with a torn set of items. An `Effect.gen`
 * program declaring the {@link Database} requirement (ADR-0014); the Action
 * provides the D1 layer and runs it.
 *
 * The write is authoritative and comes *before* the Stripe session exists (#65):
 * the row is the shop's own record of what was ordered at the price it was locked
 * to, independent of whether the customer ever completes payment. Stock is neither
 * held nor decremented here — the read-only gate in `createCheckoutSession` is all
 * the availability discipline this checkpoint applies (#34/#35).
 */
export const insertPendingOrder = (
  order: PendingOrder,
): Effect.Effect<void, OrderWriteError, Database> =>
  Effect.gen(function* () {
    const db = yield* Database;

    const orderStatement = db.insert(orders).values({
      id: order.id,
      currency: order.currency,
      createdAt: order.createdAt,
    });

    const lineStatements = order.lines.map((line) =>
      db.insert(orderItems).values({
        orderId: order.id,
        productId: line.productId,
        blankId: line.item.blankId,
        patternId: line.item.patternId,
        yarnColorIds: line.item.yarnColorIds,
        customisation: line.item.customisation,
        // The one place a Price degrades to a bare minor-unit column; currency
        // lives once on the order row (the single-currency invariant, ADR-0016).
        unitAmount: line.unitPrice.amount,
        quantity: line.quantity,
        display: line.display,
      }),
    );

    // A quote is a `NonEmptyArray` of lines (ADR-0016), so the batch always has
    // the order row plus ≥1 line — a non-empty tuple, which `db.batch` requires.
    const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
      orderStatement,
      ...lineStatements,
    ];

    yield* Effect.tryPromise({
      try: () => db.batch(statements),
      catch: (cause) => new OrderWriteError({ cause }),
    });
  });
