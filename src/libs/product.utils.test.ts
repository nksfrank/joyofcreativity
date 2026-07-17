import { describe, expect, it } from "vitest";
import { assert } from "@/utils/assert";
import { getProductById } from "./product";
import type { ProductDefinition, ProductDetail } from "./product.types";
import {
  resolveColourNav,
  resolveColourPages,
  resolveSeoMeta,
} from "./product.utils";

const detail = ({
  details,
  ...overrides
}: Partial<ProductDetail> &
  Pick<ProductDetail, "id" | "blankId">): ProductDetail => ({
  productId: "1",
  locale: "sv",
  ...overrides,
  details: {
    name: "Signature Letter Sweater",
    description: "A cozy hand-knit sweater.",
    slug: "signature-letter-sweater",
    image: "/images/signature-letter-sweater.jpg",
    seo: {},
    ...details,
  },
});

// Product 1 offers cream/red/blue/green (blanks 1-12). Curated details cover
// cream (blank1) and red (blank4); blue and green are generated (ADR-0006).
const product1 = getProductById("1") as ProductDefinition;
const family1: ProductDetail[] = [
  detail({
    id: "1",
    blankId: "blank1",
    details: {
      name: "Signature Letter Sweater",
      description: "A cozy hand-knit sweater.",
      slug: "signature-letter-sweater",
      image: "/images/signature-letter-sweater.jpg",
      seo: { title: "Curated Cream SEO Title" },
    },
  }),
  detail({
    id: "2",
    blankId: "blank4",
    details: {
      name: "Christmas Red Signature Letter Sweater",
      description: "A festive red hand-knit.",
      slug: "christmas-red-signature-letter-sweater",
      image: "/images/christmas-red-signature-letter-sweater.jpg",
      seo: {},
    },
  }),
];

describe("resolveColourPages", () => {
  assert(product1, "product 1 fixture missing");

  const pages = resolveColourPages(product1, family1);

  it("emits one page per offered colour (ADR-0006)", () => {
    expect(pages.map((p) => p.colorId)).toEqual([
      "cream",
      "red",
      "blue",
      "green",
    ]);
  });

  it("uses curated id/slug/texts/seo where a colour has a detail", () => {
    const cream = pages.find((p) => p.colorId === "cream");
    expect(cream).toMatchObject({
      id: "1",
      slug: "signature-letter-sweater",
      name: "Signature Letter Sweater",
      seo: { title: "Curated Cream SEO Title" },
    });
  });

  it("generates id/slug/name from the primary detail for uncurated colours", () => {
    const blue = pages.find((p) => p.colorId === "blue");
    expect(blue).toMatchObject({
      id: "1-blue",
      slug: "signature-letter-sweater-blue",
      name: "Signature Letter Sweater — Blue",
      colourName: "Blue",
      seo: {},
    });
  });

  it("only considers details of the given family", () => {
    // A foreign-family detail must never leak into another product's pages.
    const withForeign = resolveColourPages(product1, [
      ...family1,
      detail({ id: "99", blankId: "blank19", productId: "2" }),
    ]);
    expect(withForeign.map((p) => p.colorId)).toEqual([
      "cream",
      "red",
      "blue",
      "green",
    ]);
  });

  it("returns an empty list when the family has no details", () => {
    const pagesNoDetails = resolveColourPages(product1, []);
    // Every colour is generated with no base to draw from.
    expect(pagesNoDetails.map((p) => p.colorId)).toEqual([
      "cream",
      "red",
      "blue",
      "green",
    ]);
    expect(pagesNoDetails.at(0)?.id).toBe("1-cream");
  });
});

describe("resolveColourNav", () => {
  const nav = resolveColourNav(product1, family1, "red");

  it("marks the current colour and links every page", () => {
    const red = nav.find((n) => n.colorId === "red");
    expect(red?.isCurrent).toBe(true);
    expect(red?.href).toContain(
      "/product/2/christmas-red-signature-letter-sweater",
    );
    expect(nav.every((n) => n.href.length > 0)).toBe(true);
  });

  it("marks no page current when the colour is unknown", () => {
    const listingNav = resolveColourNav(product1, family1, "");
    expect(listingNav.some((n) => n.isCurrent)).toBe(false);
  });
});

describe("resolveSeoMeta", () => {
  const base = {
    name: "Snowdrift Sweater",
    description: "A crisp white knit.",
    image: "/images/snowdrift.jpg",
  };

  it("falls back to the page's own texts when no overrides are set", () => {
    expect(resolveSeoMeta({ ...base, seo: {} })).toEqual({
      title: "Snowdrift Sweater",
      description: "A crisp white knit.",
      keywords: undefined,
      ogTitle: "Snowdrift Sweater",
      ogDescription: "A crisp white knit.",
      ogImage: "/images/snowdrift.jpg",
      ogType: "product",
    });
  });

  it("applies overrides and cascades title/description into OG", () => {
    const resolved = resolveSeoMeta({
      ...base,
      seo: { title: "Custom Title", keywords: ["knit"], ogImage: "/og.jpg" },
    });
    expect(resolved).toMatchObject({
      title: "Custom Title",
      ogTitle: "Custom Title",
      keywords: ["knit"],
      ogImage: "/og.jpg",
      description: "A crisp white knit.",
      ogDescription: "A crisp white knit.",
    });
  });
});
