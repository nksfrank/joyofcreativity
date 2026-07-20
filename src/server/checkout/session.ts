import { Effect } from "effect";
import { getProductById } from "@/libs/product";
import { ProductCatalogue } from "@/libs/product-catalogue";
import type { Database } from "@/server/db/client";
import {
  insertPendingOrder,
  type OrderWriteError,
  type PendingOrderLine,
} from "@/server/db/orders";
import type { StockReadError } from "@/server/db/stock";
import { uuidv7 } from "@/server/id";
import {
  type CheckoutLineItem,
  Stripe,
  type StripeError,
} from "@/server/stripe";
import type { LineProblem } from "./checkout";
import { type QuoteLine, QuoteSigner, type SignedQuote } from "./quote";
import { readShortfalls } from "./stock-gate";

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

/**
 * A blocking outcome that is a normal customer situation, not an infrastructure
 * fault. The failure shape is the *same* `LineProblem[]` taxonomy the add-time
 * checkpoint (`validateCheckout`) returns (#54 architecture review, candidate 3),
 * so the whole trust boundary speaks one vocabulary: a lapsed price lock is
 * `price_drift`, a forged signature is `tampered`, and a TOCTOU stock loss is
 * `out_of_stock` — each carried per line, exactly as at add-time.
 */
export type CheckoutSessionResult =
  /** The quote verified, the order was written, and Stripe returned a session to mount. */
  | { ok: true; clientSecret: string; orderReference: string }
  /** The commit was blocked; the problems, in the shared four-bucket taxonomy. */
  | { ok: false; problems: LineProblem[] };

/**
 * Map a failed quote verification into the shared taxonomy. An expired lock is
 * the one sanctioned producer of `price_drift` — the bucket exists precisely for
 * "your locked price lapsed, here is the current total" — while a bad signature
 * is a `tampered` cart-level problem. Both are cart-level (`index: -1`).
 */
const quoteProblem = (reason: "signature" | "expired"): LineProblem =>
  reason === "expired"
    ? {
        index: -1,
        bucket: "price_drift",
        reasons: [
          "Your saved price has expired. Please review your cart for the current total.",
        ],
      }
    : {
        index: -1,
        bucket: "tampered",
        reasons: [
          "We couldn't verify your saved cart. Please review it and try again.",
        ],
      };

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
      return { ok: false, problems: [quoteProblem(verification.reason)] };
    }
    const verified = verification.payload;

    // (2) TOCTOU stock gate: a line the live count no longer covers blocks the
    // whole session. The shared gate re-reads live on-hand and never holds or
    // decrements (#34/#35). A shortfall surfaces per line in the same taxonomy.
    const shortfalls = yield* readShortfalls(
      verified.lines.map((line) => ({
        blankId: line.item.blankId,
        quantity: line.quantity,
      })),
    );
    if (shortfalls.length > 0) {
      return {
        ok: false,
        problems: shortfalls.flatMap((index) => {
          const line = verified.lines[index];
          return line
            ? [
                {
                  index,
                  bucket: "out_of_stock" as const,
                  reasons: [`${describeLine(line)} is no longer in stock`],
                },
              ]
            : [];
        }),
      };
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
      // The Price crosses the seam intact; orders.ts degrades it to a column.
      unitPrice: line.unitPrice,
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
