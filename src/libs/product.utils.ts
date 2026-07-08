import { localizeHref } from "@/i18n/runtime";
import { colors, getBlankById, sizes } from "./blank";
import type { Blank, Color, Size } from "./blank.types";
import { resolveBlankOptionsByProduct } from "./blank.utils";
import { getProductById, getProductDetailsByProductId } from "./product";
import type { ProductDefinition, ProductDetail } from "./product.types";

/** The canonical, localized URL for a product detail page. */
const getProductDetailHref = (
  detail: Pick<ProductDetail, "id" | "details">,
): string => localizeHref(`/product/${detail.id}/${detail.details.slug}`);

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
  href: string;
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
      return {
        ...sibling,
        color,
        size,
        isCurrent: sibling.id === detail.id,
        href: getProductDetailHref(sibling),
      };
    })
    .filter((variant) => variant !== undefined);

/**
 * One navigable page per colour the family offers (ADR-0006). A curated ProductDetail
 * for a colour supplies its id/slug/texts; other colours get a page generated from the
 * family's primary detail. Route-driven colour means every colour has a real, indexable URL.
 */
export type ColourPage = {
  productId: string;
  id: string;
  slug: string;
  colorId: string;
  colourName: string;
  name: string;
  description: string;
  image: string;
};

export const resolveColourPages = (productId: string): ColourPage[] => {
  const definition = getProductById(productId);
  if (!definition) {
    return [];
  }
  const details = getProductDetailsByProductId(productId);
  const base = details[0]?.details;

  const seen = new Set<string>();
  const pages: ColourPage[] = [];
  for (const option of resolveBlankOptionsByProduct(definition)) {
    if (seen.has(option.color.id)) {
      continue;
    }
    seen.add(option.color.id);

    const curated = details.find(
      (detail) => getBlankById(detail.blankId)?.colorId === option.color.id,
    );
    if (curated) {
      pages.push({
        productId,
        id: curated.id,
        slug: curated.details.slug,
        colorId: option.color.id,
        colourName: option.color.name,
        name: curated.details.name,
        description: curated.details.description,
        image: curated.details.image,
      });
    } else {
      pages.push({
        productId,
        id: `${productId}-${option.color.id}`,
        slug: base
          ? `${base.slug}-${option.color.id}`
          : `${productId}-${option.color.id}`,
        colorId: option.color.id,
        colourName: option.color.name,
        name: base ? `${base.name} — ${option.color.name}` : option.color.name,
        description: base?.description ?? "",
        image: base?.image ?? "",
      });
    }
  }
  return pages;
};

/** A colour page joined with its localized href and whether it is the current page. */
export type ColourNavItem = ColourPage & { href: string; isCurrent: boolean };

/** Every colour page for the family, for rendering the route-driven colour navigator. */
export const resolveColourNav = (
  productId: string,
  currentColorId: string,
): ColourNavItem[] =>
  resolveColourPages(productId).map((page) => ({
    ...page,
    href: localizeHref(`/product/${page.id}/${page.slug}`),
    isCurrent: page.colorId === currentColorId,
  }));
