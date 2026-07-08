import { colors, getBlankById, sizes } from "./blank";
import type { Blank, Color, Size } from "./blank.types";
import type { ProductDefinition } from "./product.types";

/** Builds a human-readable label for a blank, e.g. "Cream Small". */
export const describeBlank = (blank: Blank): string => {
  const color = colors.find((c) => c.id === blank.colorId);
  const size = sizes.find((s) => s.id === blank.sizeId);
  return [color?.name, size?.name].filter(Boolean).join(" ");
};

/** A blank this product offers, joined with its color/size names for display. */
export type BlankOption = {
  blankId: string;
  color: Color;
  size: Size;
  stock: number;
};

/** Every Color x Size combination this product can be built from, for rendering pickers. */
export const resolveBlankOptionsByProduct = (
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
    .filter((option): option is BlankOption => option !== undefined);
