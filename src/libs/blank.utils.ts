import type { Color, Size } from "./blank.types";

/** A blank this product offers, joined with its color/size names for display. */
export type BlankOption = {
  blankId: string;
  color: Color;
  size: Size;
};
