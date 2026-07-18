import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * On-hand stock for a {@link Blank}, the shop's first durable memory (#60).
 *
 * One row per Blank: `blank_id` is the Blank's id (the same key the pure
 * engines evaluate against, see `blank.types.ts`), `on_hand` its physical count.
 * Stock lives here — not on any product — because it is shared inventory: any
 * product built from a Blank draws down the same count (CONTEXT.md, ADR none).
 *
 * Deliberately nothing else. Reservation / decrement columns belong to the
 * transact flow (#34/#35), not this table. The `on_hand >= 0` CHECK is the
 * database-level floor under that later logic — over-selling can never be
 * persisted, whatever a caller computes.
 */
export const stock = sqliteTable(
  "stock",
  {
    blankId: text("blank_id").primaryKey(),
    onHand: integer("on_hand").notNull().default(0),
  },
  (table) => [check("stock_on_hand_non_negative", sql`${table.onHand} >= 0`)],
);

export type StockRow = typeof stock.$inferSelect;
