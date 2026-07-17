import { type CollectionEntry, getCollection } from "astro:content";
import { getAllProducts, getProductById } from "./product";
import type { ProductDetail } from "./product.types";
import {
  type ColourNavItem,
  type ColourPage,
  resolveColourNav,
  resolveColourPages,
} from "./product.utils";

/**
 * The content-collection layer for Product Details (issue #59). This is the ONLY
 * module that touches `astro:content`, keeping the isomorphic engines (which import
 * product.ts / product.utils.ts) free of the collection so they still run
 * client-side with no async load. Import it only from `.astro` pages/components.
 */

/** Maps a `products` collection entry to the code-side ProductDetail shape. */
const toProductDetail = (
  entry: CollectionEntry<"products">,
): ProductDetail => ({
  id: entry.id,
  productId: entry.data.productId,
  blankId: entry.data.blankId,
  locale: entry.data.locale,
  details: {
    name: entry.data.name,
    description: entry.data.description,
    slug: entry.data.slug,
    image: entry.data.image,
    seo: entry.data.seo,
  },
});

/**
 * Every Product Detail, sorted by id so the family's *primary* detail (the first
 * one) is deterministic — resolveColourPages uses it as the base for generated
 * colours (ADR-0006). Collection order is otherwise unspecified.
 */
export const getAllProductDetails = async (): Promise<ProductDetail[]> => {
  const entries = await getCollection("products");
  return entries
    .map(toProductDetail)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
};

export const getProductDetailsByProductId = async (
  productId: string,
): Promise<ProductDetail[]> =>
  (await getAllProductDetails()).filter(
    (detail) => detail.productId === productId,
  );

/**
 * The raw collection entry for a Product Detail id, for rendering its body.
 * Looked up in the loaded collection (not `getEntry`) so a miss — e.g. a generated
 * colour page whose id has no entry — returns undefined without a console warning.
 */
export const getProductDetailEntry = async (
  id: string,
): Promise<CollectionEntry<"products"> | undefined> =>
  (await getCollection("products")).find((entry) => entry.id === id);

/** The route-driven colour pages for a family (ADR-0006), sourced from the collection. */
export const getColourPages = async (
  productId: string,
): Promise<ColourPage[]> => {
  const definition = getProductById(productId);
  if (!definition) {
    return [];
  }
  return resolveColourPages(definition, await getAllProductDetails());
};

/** Every colour page for a family joined with hrefs + current flag, for the navigator. */
export const getColourNav = async (
  productId: string,
  currentColorId: string,
): Promise<ColourNavItem[]> => {
  const definition = getProductById(productId);
  if (!definition) {
    return [];
  }
  return resolveColourNav(
    definition,
    await getAllProductDetails(),
    currentColorId,
  );
};

/** Every colour page across all families, for static path generation. */
export const getAllColourPages = async (): Promise<ColourPage[]> => {
  const details = await getAllProductDetails();
  return getAllProducts().flatMap((definition) =>
    resolveColourPages(definition, details),
  );
};
