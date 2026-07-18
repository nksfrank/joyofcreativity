import { getBlankById } from "./blank";
import type { Blank, Color, Size, StockSnapshot } from "./blank.types";
import type { ProductDefinition } from "./product.types";

/** A blank this product offers, joined with its color/size names for display. */
export type BlankOption = {
  blankId: string;
  color: Color;
  size: Size;
};

/**
 * Builds a StockSnapshot from the fixture stock of every blank a product offers.
 * This is the single place that reads `Blank.stock` for the engines — the seam
 * to be swapped for a live D1 read once stock moves off the fixture (#54).
 */
export const fixtureStockSnapshot = (
  definition: Pick<ProductDefinition, "blanks">,
): StockSnapshot =>
  new Map(
    definition.blanks
      .map((productBlank) => getBlankById(productBlank.blankId))
      .filter((blank): blank is Blank => blank !== undefined)
      .map((blank) => [blank.id, blank.stock] as const),
  );
