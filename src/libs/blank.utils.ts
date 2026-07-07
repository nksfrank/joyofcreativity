import { colors, sizes } from "./blank.data";
import type { Blank } from "./blank.types";

/** Builds a human-readable label for a blank, e.g. "Cream Small". */
export const describeBlank = (blank: Blank): string => {
  const color = colors.find((c) => c.id === blank.colorId);
  const size = sizes.find((s) => s.id === blank.sizeId);
  return [color?.name, size?.name].filter(Boolean).join(" ");
};
