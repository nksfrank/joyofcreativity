import { Schema } from "effect";
import type { CurrencyCode, Price } from "@/libs/money";
import type { ProductOrderItem } from "@/libs/product.types";

/**
 * The `effect/Schema` codecs for the domain values that cross the checkout wire
 * (ADR-0014). They are the single source: the request schema, the signed-quote
 * schema, and the TS types the server passes around are all derived from these,
 * so a shape can be decoded (parsed, never cast) at every boundary and can only
 * be edited in one place. Kept out of `src/libs/` because `effect` must not reach
 * the isomorphic core / client bundle (ADR-0013/0014).
 *
 * Each codec that restates a `src/libs` domain shape is pinned to it by a
 * compile-time `Assert<Equals<…>>` below the schema, so a change to the domain
 * type that the codec doesn't follow (an added field, a third currency) fails
 * `npm run check` instead of silently decoding the old shape. The domain types
 * are `import type`-only, so nothing from `effect` reaches `src/libs` (ADR-0013).
 */

/**
 * True only when `A` and `B` are the *same* type — mutually assignable and equal
 * in variance (so `readonly`/mutable and exact field sets both count). The two
 * `<T>() => …` wrappers defer resolution so the conditional compares the types
 * invariantly rather than by one-directional assignability.
 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/** Compiles only when its argument is `true`; a failed mirror is a `tsc` error here. */
type Assert<_T extends true> = never;

/** The two supported currencies as a decodable literal — mirrors `CurrencyCode` in money.ts. */
export const CurrencyCodeSchema = Schema.Literal("SEK", "EUR");
type _CurrencyCodeMirror = Assert<
  Equals<Schema.Schema.Type<typeof CurrencyCodeSchema>, CurrencyCode>
>;

/**
 * A serialized money value — mirrors `Price` in money.ts (integer minor units +
 * currency). `mutable` so the decoded fields match the domain type's mutable
 * record (type-only; decoding is unchanged), enforced by the assertion below.
 */
export const PriceSchema = Schema.mutable(
  Schema.Struct({
    amount: Schema.Number,
    currency: CurrencyCodeSchema,
  }),
);
type _PriceMirror = Assert<
  Equals<Schema.Schema.Type<typeof PriceSchema>, Price>
>;

/**
 * A complete, resolved configuration — mirrors `ProductOrderItem` in
 * product.types.ts. `mutable` on the struct matches the domain type's mutable
 * fields, and `mutable` on the array makes `yarnColorIds` the `string[]` the pure
 * engines read (they never mutate it). Both are type-only; decoding is unchanged.
 */
export const ProductOrderItemSchema = Schema.mutable(
  Schema.Struct({
    blankId: Schema.String,
    patternId: Schema.String,
    yarnColorIds: Schema.mutable(Schema.Array(Schema.String)),
    customisation: Schema.String,
  }),
);
type _ProductOrderItemMirror = Assert<
  Equals<Schema.Schema.Type<typeof ProductOrderItemSchema>, ProductOrderItem>
>;
