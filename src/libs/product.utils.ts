import {
  colors,
  findBlankByColorAndSize,
  getBlankById,
  sizes,
} from "./blank.data";
import type { Blank, Color, Size } from "./blank.types";
import type { ProductDefinition, ProductOrderItem } from "./product.types";

/**
 * Resolves a shopper's Color + Size pick to the shared blank, but only
 * if this product actually offers that blank.
 */
export const resolveProductBlank = (
  definition: Pick<ProductDefinition, "blanks">,
  selection: Pick<ProductOrderItem, "colorId" | "sizeId">,
): Blank | undefined => {
  const blank = findBlankByColorAndSize(selection.colorId, selection.sizeId);
  if (!blank) {
    return undefined;
  }
  const offered = definition.blanks.some((pb) => pb.blankId === blank.id);
  return offered ? blank : undefined;
};

/** A blank this product offers, joined with its color/size names for display. */
export type BlankOption = {
  blankId: string;
  color: Color;
  size: Size;
  stock: number;
};

/** Every Color x Size combination this product can be built from, for rendering pickers. */
export const resolveProductBlankOptions = (
  definition: Pick<ProductDefinition, "blanks">,
): BlankOption[] =>
  definition.blanks
    .map((productBlank): BlankOption | undefined => {
      const blank = getBlankById(productBlank.blankId);
      const color = colors.find((c) => c.id === blank?.colorId);
      const size = sizes.find((s) => s.id === blank?.sizeId);
      if (!blank || !color || !size) {
        return undefined;
      }
      return { blankId: blank.id, color, size, stock: blank.stock };
    })
    .filter((option) => option !== undefined);
