import { colors, getBlankById, sizes } from "./blank.data";
import type { Blank, Color, Size } from "./blank.types";
import { getProductDetailsByProductId } from "./product.data";
import type { ProductDefinition, ProductDetail } from "./product.types";

/** Resolves a blank id to the shared blank, but only if this product actually offers it. */
export const resolveProductBlank = (
  definition: Pick<ProductDefinition, "blanks">,
  blankId: string,
): Blank | undefined => {
  const offered = definition.blanks.some((pb) => pb.blankId === blankId);
  return offered ? getBlankById(blankId) : undefined;
};

/** A sibling ProductDetail of the same product family, for linking between variants. */
export type ProductDetailVariant = ProductDetail & {
  color: Color;
  size: Size;
  isCurrent: boolean;
};

/** Every curated ProductDetail sharing this detail's product family, joined with its blank's color/size. */
export const resolveProductDetailVariants = (
  detail: Pick<ProductDetail, "id" | "productId">,
): ProductDetailVariant[] =>
  getProductDetailsByProductId(detail.productId)
    .map((sibling): ProductDetailVariant | undefined => {
      const blank = getBlankById(sibling.blankId);
      const color = colors.find((c) => c.id === blank?.colorId);
      const size = sizes.find((s) => s.id === blank?.sizeId);
      if (!blank || !color || !size) {
        return undefined;
      }
      return { ...sibling, color, size, isCurrent: sibling.id === detail.id };
    })
    .filter((variant) => variant !== undefined);
