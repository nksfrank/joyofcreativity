import { describe, expect, it } from "vitest";
import { blanks, colors, sizes } from "./blank";
import type { Blank } from "./blank.types";
import { Catalogue } from "./catalogue";
import {
  assertFixtureIntegrity,
  checkFixtureIntegrity,
} from "./fixture-integrity";
import { getAllProducts } from "./product";
import type { ProductDefinition, ProductDetail } from "./product.types";

const noModifier = { value: 0, type: "fixed" as const };

const detail = (
  id: string,
  productId: string,
  blankId: string,
): ProductDetail => ({
  id,
  productId,
  blankId,
  locale: "sv",
  details: {
    name: id,
    description: id,
    slug: id,
    image: `/img/${id}.jpg`,
    seo: {},
  },
});

describe("checkFixtureIntegrity", () => {
  it("reports no problems for the real fixtures", () => {
    const problems = checkFixtureIntegrity({
      catalogue: new Catalogue({ colors, sizes, blanks }),
      products: getAllProducts(),
      details: [],
    });
    expect(problems).toEqual([]);
  });

  it("flags a blank whose colour id is dangling", () => {
    const badBlanks: Blank[] = [
      { id: "b1", colorId: "chartreuse", sizeId: "small", stock: 1 },
    ];
    const problems = checkFixtureIntegrity({
      catalogue: new Catalogue({ colors, sizes, blanks: badBlanks }),
      products: [],
      details: [],
    });
    expect(problems).toEqual([expect.stringContaining("chartreuse")]);
  });

  it("flags a blank whose size id is dangling", () => {
    const badBlanks: Blank[] = [
      { id: "b1", colorId: "cream", sizeId: "xxl", stock: 1 },
    ];
    const problems = checkFixtureIntegrity({
      catalogue: new Catalogue({ colors, sizes, blanks: badBlanks }),
      products: [],
      details: [],
    });
    expect(problems).toEqual([expect.stringContaining("xxl")]);
  });

  it("flags a product blank whose blank id is not in the catalogue", () => {
    const product: ProductDefinition = {
      id: "9",
      price: { amount: 1000, currency: "SEK" },
      blanks: [{ blankId: "ghost", priceModifier: noModifier }],
      patternVariants: [],
      availableYarnColours: [],
      customisation: {
        allowText: false,
        maxLength: 0,
        priceModifier: noModifier,
      },
    };
    const problems = checkFixtureIntegrity({
      catalogue: new Catalogue({ colors, sizes, blanks }),
      products: [product],
      details: [],
    });
    expect(problems).toEqual([expect.stringContaining("ghost")]);
  });

  it("flags a pattern variant referencing an unknown compatible blank id", () => {
    const product: ProductDefinition = {
      id: "9",
      price: { amount: 1000, currency: "SEK" },
      blanks: [{ blankId: "blank1", priceModifier: noModifier }],
      patternVariants: [
        {
          pattern: {
            id: "plain",
            name: "Plain",
            description: "",
            priceModifier: noModifier,
          },
          compatibleBlankIds: ["blank1", "phantom"],
          requiredYarnCount: 1,
        },
      ],
      availableYarnColours: [],
      customisation: {
        allowText: false,
        maxLength: 0,
        priceModifier: noModifier,
      },
    };
    const problems = checkFixtureIntegrity({
      catalogue: new Catalogue({ colors, sizes, blanks }),
      products: [product],
      details: [],
    });
    expect(problems).toEqual([expect.stringContaining("phantom")]);
  });

  it("flags a detail whose product id is dangling", () => {
    const problems = checkFixtureIntegrity({
      catalogue: new Catalogue({ colors, sizes, blanks }),
      products: getAllProducts(),
      details: [detail("x", "404", "blank1")],
    });
    expect(problems).toEqual([expect.stringContaining("404")]);
  });

  it("flags a detail whose blank id is dangling", () => {
    const problems = checkFixtureIntegrity({
      catalogue: new Catalogue({ colors, sizes, blanks }),
      products: getAllProducts(),
      details: [detail("x", "1", "nope-blank")],
    });
    expect(problems).toEqual([expect.stringContaining("nope-blank")]);
  });

  it("collects every distinct problem", () => {
    const badBlanks: Blank[] = [
      { id: "b1", colorId: "chartreuse", sizeId: "xxl", stock: 1 },
    ];
    const problems = checkFixtureIntegrity({
      catalogue: new Catalogue({ colors, sizes, blanks: badBlanks }),
      products: [],
      details: [],
    });
    expect(problems).toHaveLength(2);
  });
});

describe("assertFixtureIntegrity", () => {
  it("passes silently for the real fixtures", () => {
    expect(() =>
      assertFixtureIntegrity({
        catalogue: new Catalogue({ colors, sizes, blanks }),
        products: getAllProducts(),
        details: [],
      }),
    ).not.toThrow();
  });

  it("throws loudly, naming the dangling id", () => {
    expect(() =>
      assertFixtureIntegrity({
        catalogue: new Catalogue({ colors, sizes, blanks }),
        products: getAllProducts(),
        details: [detail("x", "404", "blank1")],
      }),
    ).toThrow(/404/);
  });
});
