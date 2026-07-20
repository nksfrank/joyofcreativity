import { Schema } from "effect";

/**
 * The `effect/Schema` codecs for the domain values that cross the checkout wire
 * (ADR-0014). They are the single source: the request schema, the signed-quote
 * schema, and the TS types the server passes around are all derived from these,
 * so a shape can be decoded (parsed, never cast) at every boundary and can only
 * be edited in one place. Kept out of `src/libs/` because `effect` must not reach
 * the isomorphic core / client bundle (ADR-0013/0014).
 */

/** The two supported currencies as a decodable literal — mirrors `CurrencyCode` in money.ts. */
export const CurrencyCodeSchema = Schema.Literal("SEK", "EUR");

/** A serialized money value — mirrors `Price` in money.ts (integer minor units + currency). */
export const PriceSchema = Schema.Struct({
  amount: Schema.Number,
  currency: CurrencyCodeSchema,
});

/**
 * A complete, resolved configuration — mirrors `ProductOrderItem` in
 * product.types.ts. `yarnColorIds` is `mutable` so the decoded item matches the
 * `string[]` the pure engines read (they never mutate it).
 */
export const ProductOrderItemSchema = Schema.Struct({
  blankId: Schema.String,
  patternId: Schema.String,
  yarnColorIds: Schema.mutable(Schema.Array(Schema.String)),
  customisation: Schema.String,
});
