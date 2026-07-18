import { localizeHref } from "@/i18n/runtime";
import type { Color, Size } from "./blank.types";
import { catalogue } from "./catalogue";
import type {
  ProductDefinition,
  ProductDetail,
  SeoMeta,
} from "./product.types";
import { ProductCatalogue } from "./product-catalogue";

/** The canonical, localized URL for a product detail page. */
const getProductDetailHref = (
  detail: Pick<ProductDetail, "id" | "details">,
): string => localizeHref(`/product/${detail.id}/${detail.details.slug}`);

/** A sibling ProductDetail of the same product family, for linking between variants. */
export type ProductDetailVariant = ProductDetail & {
  color: Color;
  size: Size;
  isCurrent: boolean;
  href: string;
};

/**
 * `siblings` (every ProductDetail of the family) joined with each one's blank
 * color/size, marking `detail` as current. The caller supplies the siblings —
 * this stays pure so it never reaches into the content collection.
 */
export const resolveProductDetailVariants = (
  detail: Pick<ProductDetail, "id" | "productId">,
  siblings: ProductDetail[],
): ProductDetailVariant[] =>
  siblings
    .filter((sibling) => sibling.productId === detail.productId)
    .map((sibling): ProductDetailVariant | undefined => {
      const blank = catalogue.getBlank(sibling.blankId);
      const color = blank && catalogue.getColor(blank.colorId);
      const size = blank && catalogue.getSize(blank.sizeId);
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
 * for a colour supplies its id/slug/texts/seo; other colours get a page generated from
 * the family's primary detail. Route-driven colour means every colour has a real,
 * indexable URL. Pure: the caller supplies the family's `details` (from the content
 * collection) so no engine or util reaches into `astro:content`.
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
  seo: SeoMeta;
};

export const resolveColourPages = (
  definition: ProductDefinition,
  details: ProductDetail[],
): ColourPage[] => {
  const family = details.filter((d) => d.productId === definition.id);
  const base = family.at(0)?.details;

  const products = new ProductCatalogue(definition);
  const seen = new Set<string>();
  const pages: ColourPage[] = [];
  for (const option of products.blankOptions()) {
    if (seen.has(option.color.id)) {
      continue;
    }
    seen.add(option.color.id);

    const curated = family.find(
      (detail) =>
        catalogue.getBlank(detail.blankId)?.colorId === option.color.id,
    );
    if (curated) {
      pages.push({
        productId: definition.id,
        id: curated.id,
        slug: curated.details.slug,
        colorId: option.color.id,
        colourName: option.color.name,
        name: curated.details.name,
        description: curated.details.description,
        image: curated.details.image,
        seo: curated.details.seo,
      });
    } else {
      pages.push({
        productId: definition.id,
        id: `${definition.id}-${option.color.id}`,
        slug: base
          ? `${base.slug}-${option.color.id}`
          : `${definition.id}-${option.color.id}`,
        colorId: option.color.id,
        colourName: option.color.name,
        name: base ? `${base.name} — ${option.color.name}` : option.color.name,
        description: base?.description ?? "",
        image: base?.image ?? "",
        // Generated colours have no curated SEO; the renderer falls back to the
        // colour-specific name/description/image above (see resolveSeoMeta).
        seo: {},
      });
    }
  }
  return pages;
};

/** A colour page joined with its localized href and whether it is the current page. */
export type ColourNavItem = ColourPage & { href: string; isCurrent: boolean };

/** Every colour page for the family, for rendering the route-driven colour navigator. */
export const resolveColourNav = (
  definition: ProductDefinition,
  details: ProductDetail[],
  currentColorId: string,
): ColourNavItem[] =>
  resolveColourPages(definition, details).map((page) => ({
    ...page,
    href: localizeHref(`/product/${page.id}/${page.slug}`),
    isCurrent: page.colorId === currentColorId,
  }));

/** The concrete meta a page renders, with every SeoMeta fallback applied. */
export type ResolvedSeo = {
  title: string;
  description: string;
  keywords?: string[];
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: string;
};

/**
 * Resolves a colour page's optional SEO overrides against its own marketing texts:
 * an absent field falls back to the page name/description/image so every page has
 * complete meta, curated or generated.
 */
export const resolveSeoMeta = (
  page: Pick<ColourPage, "name" | "description" | "image" | "seo">,
): ResolvedSeo => {
  const seo = page.seo ?? {};
  const title = seo.title ?? page.name;
  const description = seo.description ?? page.description;
  return {
    title,
    description,
    keywords: seo.keywords,
    ogTitle: seo.ogTitle ?? title,
    ogDescription: seo.ogDescription ?? description,
    ogImage: seo.ogImage ?? page.image,
    ogType: seo.ogType ?? "product",
  };
};
