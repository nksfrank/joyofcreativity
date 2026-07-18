import { getAllProducts, getProductById } from "./product";
import type { ProductDetail } from "./product.types";
import {
  type ColourNavItem,
  type ColourPage,
  resolveColourNav,
  resolveColourPages,
} from "./product.utils";

/**
 * The seam under the content adapter (issue #59, architecture-review candidate 3).
 * A {@link ProductContentSource} yields the raw, unsorted Product Details; nothing
 * on this side of the seam touches `astro:content`, so the content logic layered on
 * top ({@link ProductContent}) runs isomorphically and can be exercised in tests
 * against an in-memory source instead of only through a full build.
 *
 * Two adapters justify the seam: the `astro:content` source in prod
 * (product-content.ts) and {@link InMemoryProductContentSource} in tests.
 */
export interface ProductContentSource {
  /** Every Product Detail, mapped to the code-side shape (order unspecified). */
  loadProductDetails(): Promise<ProductDetail[]>;
}

/** An in-memory {@link ProductContentSource} over a fixed list, for tests. */
export class InMemoryProductContentSource implements ProductContentSource {
  readonly #details: readonly ProductDetail[];

  constructor(details: readonly ProductDetail[]) {
    this.#details = details;
  }

  loadProductDetails(): Promise<ProductDetail[]> {
    return Promise.resolve([...this.#details]);
  }
}

/**
 * The isomorphic content logic over a {@link ProductContentSource}: deterministic
 * ordering, the family filter, and the route-driven colour-page joins (ADR-0006).
 * The `astro:content` mapping lives in the source; everything here is pure enough
 * to test with an in-memory adapter.
 */
export class ProductContent {
  readonly #source: ProductContentSource;

  constructor(source: ProductContentSource) {
    this.#source = source;
  }

  /**
   * Every Product Detail, sorted by id so a family's *primary* detail (the first
   * one) is deterministic — resolveColourPages uses it as the base for generated
   * colours (ADR-0006). Source order is otherwise unspecified.
   */
  async getAllProductDetails(): Promise<ProductDetail[]> {
    const details = await this.#source.loadProductDetails();
    // Copy before sorting: sort mutates, and a source need not hand back a throwaway.
    return [...details].sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { numeric: true }),
    );
  }

  async getProductDetailsByProductId(
    productId: string,
  ): Promise<ProductDetail[]> {
    return (await this.getAllProductDetails()).filter(
      (detail) => detail.productId === productId,
    );
  }

  /** The route-driven colour pages for a family (ADR-0006). */
  async getColourPages(productId: string): Promise<ColourPage[]> {
    const definition = getProductById(productId);
    if (!definition) {
      return [];
    }
    return resolveColourPages(definition, await this.getAllProductDetails());
  }

  /** Every colour page for a family joined with hrefs + current flag, for the navigator. */
  async getColourNav(
    productId: string,
    currentColorId: string,
  ): Promise<ColourNavItem[]> {
    const definition = getProductById(productId);
    if (!definition) {
      return [];
    }
    return resolveColourNav(
      definition,
      await this.getAllProductDetails(),
      currentColorId,
    );
  }

  /** Every colour page across all families, for static path generation. */
  async getAllColourPages(): Promise<ColourPage[]> {
    const details = await this.getAllProductDetails();
    return getAllProducts().flatMap((definition) =>
      resolveColourPages(definition, details),
    );
  }
}
