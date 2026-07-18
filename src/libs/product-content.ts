import { type CollectionEntry, getCollection } from "astro:content";
import { catalogue } from "./catalogue";
import { assertFixtureIntegrity } from "./fixture-integrity";
import { getAllProducts } from "./product";
import type { ProductDetail } from "./product.types";
import type { ColourNavItem, ColourPage } from "./product.utils";
import {
  ProductContent,
  type ProductContentSource,
} from "./product-content.core";

/**
 * The content-collection adapter for Product Details (issue #59). This is the ONLY
 * module that touches `astro:content`: it is the prod {@link ProductContentSource}
 * feeding {@link ProductContent}, keeping the isomorphic engines (and the content
 * logic itself) free of the collection so they still run client-side with no async
 * load. Import it only from `.astro` pages/components.
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

/** The prod source: the `products` astro:content collection, mapped to ProductDetail. */
const astroProductContentSource: ProductContentSource = {
  async loadProductDetails(): Promise<ProductDetail[]> {
    const entries = await getCollection("products");
    return entries.map(toProductDetail);
  },
};

const content = new ProductContent(astroProductContentSource);

export const getAllProductDetails = (): Promise<ProductDetail[]> =>
  content.getAllProductDetails();

export const getProductDetailsByProductId = (
  productId: string,
): Promise<ProductDetail[]> => content.getProductDetailsByProductId(productId);

/** The route-driven colour pages for a family (ADR-0006), sourced from the collection. */
export const getColourPages = (productId: string): Promise<ColourPage[]> =>
  content.getColourPages(productId);

/** Every colour page for a family joined with hrefs + current flag, for the navigator. */
export const getColourNav = (
  productId: string,
  currentColorId: string,
): Promise<ColourNavItem[]> => content.getColourNav(productId, currentColorId);

/**
 * Every colour page across all families, for static path generation. This is the
 * loud gate: a dangling colour/size/product/blank id in the fixtures fails the build
 * here rather than silently dropping a page.
 */
export const getAllColourPages = async (): Promise<ColourPage[]> => {
  assertFixtureIntegrity({
    catalogue,
    products: getAllProducts(),
    details: await getAllProductDetails(),
  });
  return content.getAllColourPages();
};

/**
 * The raw collection entry for a Product Detail id, for rendering its body. Stays an
 * `astro:content` read (not part of the isomorphic {@link ProductContent}) because
 * the body is rendered via astro's `render(entry)`. Looked up in the loaded
 * collection (not `getEntry`) so a miss — e.g. a generated colour page whose id has
 * no entry — returns undefined without a console warning.
 */
export const getProductDetailEntry = async (
  id: string,
): Promise<CollectionEntry<"products"> | undefined> =>
  (await getCollection("products")).find((entry) => entry.id === id);
