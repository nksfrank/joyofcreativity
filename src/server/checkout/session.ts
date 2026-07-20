import { Effect } from "effect";
import { getProductById } from "@/libs/product";
import { ProductCatalogue } from "@/libs/product-catalogue";
import type { Database } from "@/server/db/client";
import {
  insertPendingOrder,
  type OrderWriteError,
  type PendingOrderLine,
} from "@/server/db/orders";
import { getOnHandForBlanks, type StockReadError } from "@/server/db/stock";
import { uuidv7 } from "@/server/id";
import {
  type CheckoutLineItem,
  Stripe,
  type StripeError,
} from "@/server/stripe";
import {
  type QuoteLine,
  QuoteSigner,
  type SignedQuote,
  type VerifiedQuote,
} from "./quote";

/**
 * The second authoritative checkpoint and the shop's first written-down order
 * (#65, transact+fulfil foundation #54). Where `validateCheckout` (#64) issued a
 * signed quote, this commits it: it re-establishes authority server-side, gates
 * on live stock (a TOCTOU re-check), writes an authoritative `pending` order to
 * D1 *before* any Stripe session exists, then opens Stripe's embedded Checkout
 * from the *locked* prices and hands back the `client_secret` the island mounts.
 *
 * Trust is re-derived here, never trusted from the client (ADR-0017): the carried
 * `SignedQuote` is re-verified into a branded {@link VerifiedQuote}, and every
 * price fed to Stripe and every amount written to D1 comes from *that* — not from
 * any request field. A stale or edited cart cannot drive a charge.
 */

/** A blocking outcome that is a normal customer situation, not an infrastructure fault. */
export type CheckoutSessionResult =
  /** The quote verified, the order was written, and Stripe returned a session to mount. */
  | { ok: true; clientSecret: string; orderReference: string }
  /** The carried quote failed verification (edited/forged signature, or the price lock lapsed). */
  | { ok: false; reason: "quote_invalid"; detail: "signature" | "expired" }
  /** The TOCTOU stock re-check failed: these line indices no longer have on-hand cover. */
  | { ok: false; reason: "out_of_stock"; lines: number[] };

/**
 * A human-readable descriptor for a quote line, resolved from the catalogue at
 * commit time (the quote carries no display — `validateCheckout` strips it, #64).
 * Feeds both Stripe's `product_data.name` and the order line's `display` snapshot,
 * e.g. "Ivory Small — Plain". Tolerant: an unresolvable part falls back to its id
 * so a session is never blocked on a cosmetic lookup.
 */
const describeLine = (line: QuoteLine): string => {
  const definition = getProductById(line.productId);
  if (!definition) {
    return line.item.blankId;
  }
  const catalogue = new ProductCatalogue(definition);
  const blank = catalogue.getOfferedBlank(line.item.blankId);
  const variant = catalogue.getPatternVariant(line.item.patternId);
  return [
    blank ? catalogue.describe(blank) : line.item.blankId,
    variant?.pattern.name,
  ]
    .filter(Boolean)
    .join(" — ");
};

/**
 * The read-only stock gate (#65, #34/#35): re-read live on-hand for the quote's
 * blanks and return the indices of any line the current count no longer covers.
 * It never holds or decrements — the race window to payment is knowingly left
 * open — so this is a *check*, not a reservation.
 */
const stockShortfalls = (
  verified: VerifiedQuote,
): Effect.Effect<number[], StockReadError, Database> =>
  Effect.gen(function* () {
    const blankIds = [
      ...new Set(verified.lines.map((line) => line.item.blankId)),
    ];
    const snapshot = yield* getOnHandForBlanks(blankIds);
    return verified.lines.flatMap((line, index) =>
      (snapshot.get(line.item.blankId) ?? 0) < line.quantity ? [index] : [],
    );
  });

/**
 * Verify → read-only stock gate → persist a `pending` order → open the embedded
 * Stripe session → return its `client_secret`. Runs with the `Database`,
 * `QuoteSigner`, and `Stripe` layers provided by the Action boundary; `now` is
 * passed so verification and the order's timestamp/UUIDv7 are deterministic and
 * testable.
 */
export const createCheckoutSession = (
  quote: SignedQuote,
  returnUrl: string,
  now: number,
): Effect.Effect<
  CheckoutSessionResult,
  StockReadError | OrderWriteError | StripeError,
  Database | QuoteSigner | Stripe
> =>
  Effect.gen(function* () {
    // (1) Re-derive authority: a good signature within the lock window mints the
    // branded VerifiedQuote — the only value whose prices we will charge (ADR-0017).
    const signer = yield* QuoteSigner;
    const verification = yield* signer.verify(quote, now);
    if (!verification.valid) {
      return {
        ok: false,
        reason: "quote_invalid",
        detail: verification.reason,
      };
    }
    const verified = verification.payload;

    // (2) TOCTOU stock gate: a line the live count no longer covers blocks the
    // whole session. No stock is held or decremented (#34/#35).
    const shortfalls = yield* stockShortfalls(verified);
    if (shortfalls.length > 0) {
      return { ok: false, reason: "out_of_stock", lines: shortfalls };
    }

    // The line descriptor is the same string for the order snapshot and Stripe's
    // product name, so resolve it once per line (each is a catalogue lookup).
    const described = verified.lines.map((line) => ({
      line,
      display: describeLine(line),
    }));

    // (3) Persist the authoritative `pending` order before Stripe exists. The
    // public reference is a UUIDv7 minted from the same clock as the row.
    const orderReference = uuidv7(now);
    const lines: PendingOrderLine[] = described.map(({ line, display }) => ({
      productId: line.productId,
      item: line.item,
      quantity: line.quantity,
      unitAmount: line.unitPrice.amount,
      display,
    }));
    yield* insertPendingOrder({
      id: orderReference,
      // The single-currency invariant made durable: the quote carries one
      // currency, and it lives once on the order row (line amounts are bare
      // minor units), so a mixed-currency order is unrepresentable here.
      currency: verified.currency,
      createdAt: now,
      lines,
    });

    // (4) Open the embedded session from the LOCKED prices, stamping only the
    // compact reference id in metadata (the authoritative config stays in D1).
    const stripe = yield* Stripe;
    const lineItems: CheckoutLineItem[] = described.map(
      ({ line, display }) => ({
        name: display,
        price: line.unitPrice,
        quantity: line.quantity,
      }),
    );
    const session = yield* stripe.createCheckoutSession({
      lineItems,
      returnUrl,
      metadata: { orderReference },
    });

    // (5) Hand back the client_secret the island mounts, plus the reference.
    return { ok: true, clientSecret: session.clientSecret, orderReference };
  });
