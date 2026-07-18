import { describe, expect, it } from "vitest";
import type { ProductDetail } from "./product.types";
import {
  InMemoryProductContentSource,
  ProductContent,
} from "./product-content.core";

// Product "2" is the single-colour (white) family — blank19/20/21 across S/M/L —
// so its curated colour is `white` and it generates no other colour pages.
const detail = (
  id: string,
  productId: string,
  blankId: string,
  overrides: Partial<ProductDetail["details"]> = {},
): ProductDetail => ({
  id,
  productId,
  blankId,
  locale: "sv",
  details: {
    name: `Detail ${id}`,
    description: `Description ${id}`,
    slug: `detail-${id}`,
    image: `/img/${id}.jpg`,
    seo: {},
    ...overrides,
  },
});

// Deliberately out of id order so the sort is observable.
const details: ProductDetail[] = [
  detail("2b", "2", "blank20"),
  detail("2a", "2", "blank19"),
];

const content = () =>
  new ProductContent(new InMemoryProductContentSource(details));

describe("ProductContent", () => {
  describe("getAllProductDetails", () => {
    it("returns details sorted by id (numeric-aware) regardless of source order", async () => {
      const all = await content().getAllProductDetails();
      expect(all.map((d) => d.id)).toEqual(["2a", "2b"]);
    });

    it("does not mutate a later call's ordering guarantee", async () => {
      const c = content();
      const first = await c.getAllProductDetails();
      const second = await c.getAllProductDetails();
      expect(second.map((d) => d.id)).toEqual(first.map((d) => d.id));
    });
  });

  describe("getProductDetailsByProductId", () => {
    it("keeps only the family's details", async () => {
      const family = await content().getProductDetailsByProductId("2");
      expect(family.map((d) => d.id)).toEqual(["2a", "2b"]);
    });

    it("returns [] for a product with no details", async () => {
      expect(await content().getProductDetailsByProductId("1")).toEqual([]);
    });
  });

  describe("getColourPages", () => {
    it("joins the family's curated colour with the definition's blanks", async () => {
      const pages = await content().getColourPages("2");
      // Single-colour family: exactly one colour page, white, using the curated detail.
      expect(pages).toHaveLength(1);
      expect(pages[0]).toMatchObject({
        productId: "2",
        colorId: "white",
        colourName: "White",
      });
    });

    it("returns [] for an unknown product id (no silent throw)", async () => {
      expect(await content().getColourPages("does-not-exist")).toEqual([]);
    });
  });

  describe("getColourNav", () => {
    it("marks the current colour", async () => {
      const nav = await content().getColourNav("2", "white");
      expect(nav).toHaveLength(1);
      expect(nav[0]?.isCurrent).toBe(true);
      expect(nav[0]?.href).toContain("/product/");
    });

    it("returns [] for an unknown product id", async () => {
      expect(await content().getColourNav("nope", "white")).toEqual([]);
    });
  });

  describe("getAllColourPages", () => {
    it("spans every product family, using curated details where present", async () => {
      const pages = await content().getAllColourPages();
      // Every family in product.ts contributes at least one colour page.
      expect(pages.length).toBeGreaterThan(0);
      // Family "2" is single-colour and gets its curated white detail id.
      const white = pages.find((p) => p.productId === "2");
      expect(white?.colorId).toBe("white");
    });
  });
});
