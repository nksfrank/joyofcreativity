import type { Color, Size, StockSnapshot } from "./blank.types";

/** A blank this product offers, joined with its color/size names for display. */
export type BlankOption = {
  blankId: string;
  color: Color;
  size: Size;
};

/**
 * On-hand for a blank read from a {@link StockSnapshot} — the one place the
 * "absent blank counts as zero on-hand" rule lives. Every consumer (the
 * availability engine, the configurator, and the checkout stock gate) reads
 * on-hand through this, so the `?? 0` default can only ever be right here.
 */
export const onHand = (snapshot: StockSnapshot, blankId: string): number =>
  snapshot.get(blankId) ?? 0;
