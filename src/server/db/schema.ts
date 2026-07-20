import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { CurrencyCode } from "@/libs/money";

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

/**
 * The shop's first written-down order and the second authoritative checkpoint
 * (#65, transact+fulfil foundation #54). `createCheckoutSession` persists one row
 * here — in `pending` — *before* the Stripe session exists, so an abandoned
 * checkout leaves a harmless orphan (no stock held, no PII yet) rather than a
 * lost sale. This ticket only ever *writes* a pending order; it never transitions
 * one.
 *
 * The `id` is a UUIDv7 (see `@/server/id`): the **public reference** carried in
 * the URL, the receipt email, and Stripe session metadata — URL/email-safe,
 * non-enumerable, and time-sortable — and the FK target from {@link orderItems}.
 * `currency` is **one per order** (ADR-0016's single-currency quote invariant made
 * durable): line amounts live in minor units on the item rows, the currency once
 * here, so a cart spanning currencies can never be persisted as one order.
 *
 * Deliberately minimal. The deferred columns this design leaves room for are all
 * additive `ALTER TABLE ADD COLUMN`s later — `status` (#35), `vat_*` (#36),
 * shipping/addresses (#42), `locale`/`receipt` (#49), `erased_at` (#50) — so they
 * are *not* pre-built here; the schema only has to grow, never reshape.
 */
export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  currency: text("currency").$type<CurrencyCode>().notNull(),
  /** Epoch millis the order was written (the UUIDv7 also encodes this, kept explicit for queries). */
  createdAt: integer("created_at").notNull(),
});

export type OrderRow = typeof orders.$inferSelect;

/**
 * One line of an {@link orders} row — a **snapshot**, not a live reference. The
 * configured {@link import("@/libs/product.types").ProductOrderItem} is frozen
 * column-by-column (with the irreducible small `yarnColorIds` list as a JSON array
 * *within* the row, not a child table — it is only ever read and written whole),
 * alongside the server-locked `unitAmount` in **integer minor units** (currency on
 * the parent order), the `quantity`, and a human `display` descriptor for the
 * receipt. Nothing here is re-resolved from the catalogue later: the order records
 * what was bought at the price it was sold, immune to any later catalogue edit.
 */
export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    productId: text("product_id").notNull(),
    blankId: text("blank_id").notNull(),
    patternId: text("pattern_id").notNull(),
    yarnColorIds: text("yarn_color_ids", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    customisation: text("customisation").notNull(),
    /** Server-locked unit price in integer minor units; currency is on the order row. */
    unitAmount: integer("unit_amount").notNull(),
    quantity: integer("quantity").notNull(),
    /** Human-readable line label captured at purchase for the receipt (e.g. "Ivory Small — Plain"). */
    display: text("display").notNull(),
  },
  (table) => [
    check(
      "order_items_unit_amount_non_negative",
      sql`${table.unitAmount} >= 0`,
    ),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export type OrderItemRow = typeof orderItems.$inferSelect;
