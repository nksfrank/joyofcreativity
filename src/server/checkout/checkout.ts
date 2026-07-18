import { Effect, Schema } from "effect";
import type { ParseError } from "effect/ParseResult";
import { AvailabilityManager } from "@/libs/availability";
import type { StockSnapshot } from "@/libs/blank.types";
import type { CurrencyCode } from "@/libs/money";
import { PricingManager } from "@/libs/pricing";
import { getProductById } from "@/libs/product";
import type { ProductDefinition, ProductOrderItem } from "@/libs/product.types";
import { ProductCatalogue } from "@/libs/product-catalogue";
import type { Database } from "@/server/db/client";
import { getOnHandForBlanks, type StockReadError } from "@/server/db/stock";
import {
  QUOTE_TTL_MS,
  type QuoteLine,
  type QuotePayload,
  QuoteSigner,
  type SignedQuote,
} from "./quote";

/**
 * The first authoritative checkpoint (#64, checkout handoff & trust boundary
 * #33). The client POSTs a trust-minimal skeleton — `{ productId, item,
 * quantity }[]`, no price and no display — and the server re-prices the whole
 * cart with the same `PricingManager`/`AvailabilityManager` the client runs,
 * re-validates every line against the catalog and live D1 stock, and returns
 * *all* problems at once, classified into four buckets. A good cart comes back
 * as a signed quote (the price lock, ADR-0016) instead.
 */

/** A claimed cart line: `item` is re-validated before it is trusted (no price, no display). */
export type CheckoutRequestLine = {
  productId: string;
  item: ProductOrderItem;
  quantity: number;
};

export type CheckoutRequest = {
  lines: readonly CheckoutRequestLine[];
};

/**
 * The validation taxonomy. All lines are checked and every problem is returned
 * together so the customer sees all wrong things at once:
 *  - `tampered`     — structural: a line no honest configurator could produce
 *    (unknown product/blank/pattern, wrong yarn count, unknown/rule-violating
 *    customisation, or a cart mixing currencies).
 *  - `unavailable`  — structurally valid, but the availability engine now fails
 *    it (e.g. a discontinued yarn colour).
 *  - `out_of_stock` — valid and available, but D1 on-hand is below the quantity.
 *  - `price_drift`  — eliminated at commit by the price lock; surfaces only when
 *    a quote expires and the summary re-runs this and re-quotes.
 */
export type ProblemBucket =
  | "tampered"
  | "unavailable"
  | "out_of_stock"
  | "price_drift";

/** One line's (or the cart's, at `index: -1`) problems, all reasons in one bucket. */
export type LineProblem = {
  /** The request line this concerns; `-1` is a cart-level problem (mixed currency). */
  index: number;
  bucket: ProblemBucket;
  reasons: string[];
};

/** A good line, priced server-side — the shape a quote line carries forward. */
export type PricedLine = QuoteLine;

/** Either every line is a priceable, in-stock order item, or a list of problems. */
export type CartClassification =
  | { ok: false; problems: LineProblem[] }
  | { ok: true; lines: PricedLine[]; currency: CurrencyCode };

/** The whole-cart engines cost building once per family; reuse them across lines. */
type FamilyEngines = {
  definition: ProductDefinition;
  catalogue: ProductCatalogue;
  pricing: PricingManager;
};

/**
 * Structural (bucket 1) validation via the catalog alone — the checks an honest
 * configurator would already satisfy, so a failure here means a tampered claim.
 * Every violation is collected so all of a line's structural problems surface
 * together.
 */
const structuralReasons = (
  { definition, catalogue }: FamilyEngines,
  item: ProductOrderItem,
): string[] => {
  const reasons: string[] = [];

  const productBlank = catalogue.getProductBlank(item.blankId);
  if (!productBlank) {
    reasons.push(`Blank ${item.blankId} is not offered by this product`);
  }

  const variant = catalogue.getPatternVariant(item.patternId);
  if (!variant) {
    reasons.push(`Pattern ${item.patternId} is not offered by this product`);
  }

  if (productBlank && variant) {
    if (!variant.compatibleBlankIds.includes(item.blankId)) {
      reasons.push(
        `Pattern ${variant.pattern.name} is not compatible with the selected blank`,
      );
    }
    if (item.yarnColorIds.length !== variant.requiredYarnCount) {
      reasons.push(
        `Pattern ${variant.pattern.name} requires exactly ${variant.requiredYarnCount} yarn colours`,
      );
    }
  }

  for (const yarnColorId of item.yarnColorIds) {
    if (!catalogue.getYarnColor(yarnColorId)) {
      reasons.push(`Yarn colour ${yarnColorId} is not offered by this product`);
    }
  }

  const rule = definition.customisation;
  if (item.customisation.length > 0 && !rule.allowText) {
    reasons.push("Customisation is not allowed for this product");
  } else if (rule.allowText && item.customisation.length > rule.maxLength) {
    reasons.push(
      `Customisation exceeds the maximum length of ${rule.maxLength}`,
    );
  }

  return reasons;
};

/**
 * Availability (bucket 2) via the real `AvailabilityManager`, but against a
 * snapshot that marks every offered blank in stock. That isolates genuine
 * availability failures (a discontinued yarn colour) from stock depletion, which
 * bucket 3 owns with a quantity-aware check the boolean in-stock rule can't make.
 */
const unlimitedSnapshot = (definition: ProductDefinition): StockSnapshot =>
  new Map(
    definition.blanks.map((blank) => [blank.blankId, Number.MAX_SAFE_INTEGER]),
  );

/**
 * Classify a whole cart against the catalog and a live stock snapshot. Pure and
 * synchronous — the D1 read and the quote signing live in {@link validateCheckout}
 * so the four-bucket logic is unit-testable with hand-built snapshots.
 */
export const classifyCart = (
  request: CheckoutRequest,
  snapshot: StockSnapshot,
): CartClassification => {
  const engines = new Map<string, FamilyEngines | null>();
  const enginesFor = (productId: string): FamilyEngines | null => {
    if (!engines.has(productId)) {
      const definition = getProductById(productId);
      engines.set(
        productId,
        definition
          ? {
              definition,
              catalogue: new ProductCatalogue(definition),
              pricing: new PricingManager(definition),
            }
          : null,
      );
    }
    return engines.get(productId) ?? null;
  };

  const problems: LineProblem[] = [];
  const pricedLines: PricedLine[] = [];

  request.lines.forEach((line, index) => {
    const family = enginesFor(line.productId);
    if (!family) {
      problems.push({
        index,
        bucket: "tampered",
        reasons: [`Unknown product ${line.productId}`],
      });
      return;
    }

    const structural = structuralReasons(family, line.item);
    if (structural.length > 0) {
      problems.push({ index, bucket: "tampered", reasons: structural });
      return;
    }

    const availability = new AvailabilityManager(
      family.definition,
      unlimitedSnapshot(family.definition),
    ).check(line.item);
    if (availability.length > 0) {
      problems.push({
        index,
        bucket: "unavailable",
        reasons: availability.map((failure) => failure.reason),
      });
      return;
    }

    const onHand = snapshot.get(line.item.blankId) ?? 0;
    if (onHand < line.quantity) {
      const blank = family.catalogue.requireOfferedBlank(line.item.blankId);
      problems.push({
        index,
        bucket: "out_of_stock",
        reasons: [
          `${family.catalogue.describe(blank)} is out of stock (${onHand} on hand, ${line.quantity} requested)`,
        ],
      });
      return;
    }

    pricedLines.push({
      productId: line.productId,
      item: line.item,
      quantity: line.quantity,
      unitPrice: family.pricing.calculate(line.item),
    });
  });

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  // Single-currency invariant on the quote: a cart spanning currencies cannot be
  // totalled or locked, so it is a structural (bucket 1) problem, not a priced quote.
  const currencies = new Set(
    pricedLines.map((line) => line.unitPrice.currency),
  );
  if (currencies.size > 1) {
    return {
      ok: false,
      problems: [
        { index: -1, bucket: "tampered", reasons: ["Cart mixes currencies"] },
      ],
    };
  }

  // Exactly one currency remains: `NonEmptyArray` guarantees ≥1 line, and any
  // problem cart already returned above, so `pricedLines` is non-empty here.
  const [currency] = currencies;
  if (!currency) {
    return { ok: false, problems: [] };
  }
  return { ok: true, lines: pricedLines, currency };
};

/** The result the Action returns: a signed quote for a good cart, else the problems. */
export type ValidateCheckoutResult =
  | { ok: true; quote: SignedQuote }
  | { ok: false; problems: LineProblem[] };

const OrderItemSchema = Schema.Struct({
  blankId: Schema.String,
  patternId: Schema.String,
  // Mutable so the decoded item matches `ProductOrderItem` (a `string[]`) the
  // engines read; they never mutate it.
  yarnColorIds: Schema.mutable(Schema.Array(Schema.String)),
  customisation: Schema.String,
});

const RequestLineSchema = Schema.Struct({
  productId: Schema.String,
  item: OrderItemSchema,
  quantity: Schema.Number.pipe(Schema.int(), Schema.positive()),
});

const CheckoutRequestSchema = Schema.Struct({
  lines: Schema.NonEmptyArray(RequestLineSchema),
});

/**
 * Price the cart server-side, re-validate every line against the catalog and live
 * D1 stock, and return either all problems (four buckets) or a signed quote. The
 * D1 read is `getOnHandForBlanks` — the same server read path the configurator's
 * `getStock` feeds from (#62) — so availability is the store the shop controls,
 * never a client-supplied number. `now` is passed so the quote's issue/expiry are
 * deterministic and testable.
 */
export const validateCheckout = (
  request: unknown,
  now: number,
): Effect.Effect<
  ValidateCheckoutResult,
  StockReadError | ParseError,
  Database | QuoteSigner
> =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknown(CheckoutRequestSchema)(request);

    const blankIds = [
      ...new Set(decoded.lines.map((line) => line.item.blankId)),
    ];
    const snapshot = yield* getOnHandForBlanks(blankIds);

    const classification = classifyCart(decoded, snapshot);
    if (!classification.ok) {
      return { ok: false, problems: classification.problems };
    }

    const payload: QuotePayload = {
      lines: classification.lines,
      currency: classification.currency,
      issuedAt: now,
      expiresAt: now + QUOTE_TTL_MS,
      quoteId: crypto.randomUUID(),
    };
    const signer = yield* QuoteSigner;
    const quote = yield* signer.sign(payload);
    return { ok: true, quote };
  });
