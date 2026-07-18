import { describe, expect, it } from "vitest";
import type { Blank, Color, Size } from "./blank.types";
import { Catalogue } from "./catalogue";
import type { PatternVariant, ProductDefinition } from "./product.types";
import { ProductCatalogue } from "./product-catalogue";

const noModifier = { value: 0, type: "fixed" as const };

// A tiny catalogue: two colours, two sizes, three blanks. blank9 exists in the
// global catalogue but is NOT offered by the product below.
const colors: Color[] = [
  { id: "cream", name: "Cream" },
  { id: "red", name: "Red" },
];
const sizes: Size[] = [
  { id: "small", name: "Small" },
  { id: "large", name: "Large" },
];
const blanks: Blank[] = [
  { id: "blank1", colorId: "cream", sizeId: "small", stock: 5 },
  { id: "blank2", colorId: "cream", sizeId: "large", stock: 0 },
  { id: "blank9", colorId: "red", sizeId: "small", stock: 3 },
];
const catalogue = new Catalogue({ colors, sizes, blanks });

const twin: PatternVariant = {
  pattern: {
    id: "twin",
    name: "Twin",
    description: "Two-colour knit",
    priceModifier: noModifier,
  },
  compatibleBlankIds: ["blank1", "blank2"],
  requiredYarnCount: 2,
};

// The product offers blank1 and blank2 only — not blank9.
const definition: ProductDefinition = {
  id: "1",
  price: { amount: 79900, currency: "SEK" },
  blanks: [
    { blankId: "blank1", priceModifier: noModifier },
    { blankId: "blank2", priceModifier: noModifier },
  ],
  patternVariants: [twin],
  availableYarnColours: [
    { id: "ochre", name: "Ochre", available: true, priceModifier: noModifier },
  ],
  customisation: { allowText: false, maxLength: 0, priceModifier: noModifier },
};

const products = new ProductCatalogue(definition, catalogue);

describe("ProductCatalogue", () => {
  describe("pattern variant", () => {
    it("get returns the variant when present, undefined when absent", () => {
      expect(products.getPatternVariant("twin")).toEqual(twin);
      expect(products.getPatternVariant("nope")).toBeUndefined();
    });

    it("require throws the canonical message when absent", () => {
      expect(products.requirePatternVariant("twin")).toEqual(twin);
      expect(() => products.requirePatternVariant("nope")).toThrow(
        "Pattern variant nope not found",
      );
    });
  });

  describe("yarn colour", () => {
    it("get returns the yarn colour when present, undefined when absent", () => {
      expect(products.getYarnColor("ochre")).toEqual(
        definition.availableYarnColours[0],
      );
      expect(products.getYarnColor("nope")).toBeUndefined();
    });

    it("require throws the canonical message when absent", () => {
      expect(products.requireYarnColor("ochre")).toEqual(
        definition.availableYarnColours[0],
      );
      expect(() => products.requireYarnColor("nope")).toThrow(
        "Yarn color nope not found",
      );
    });
  });

  describe("offered blank (per-definition check)", () => {
    it("getOfferedBlank returns the blank only when this product offers it", () => {
      expect(products.getOfferedBlank("blank1")).toEqual(blanks[0]);
      // blank9 exists in the catalogue but is not offered by this product.
      expect(products.getOfferedBlank("blank9")).toBeUndefined();
      // wholly unknown id
      expect(products.getOfferedBlank("nope")).toBeUndefined();
    });

    it("requireOfferedBlank throws the canonical message when not offered", () => {
      expect(products.requireOfferedBlank("blank1")).toEqual(blanks[0]);
      expect(() => products.requireOfferedBlank("blank9")).toThrow(
        "Blank blank9 not found",
      );
      expect(() => products.requireOfferedBlank("nope")).toThrow(
        "Blank nope not found",
      );
    });
  });

  describe("offer record (price modifier)", () => {
    it("getProductBlank returns the offer only when this product offers it", () => {
      expect(products.getProductBlank("blank1")).toEqual(definition.blanks[0]);
      expect(products.getProductBlank("blank9")).toBeUndefined();
      expect(products.getProductBlank("nope")).toBeUndefined();
    });

    it("requireProductBlank returns the offer, or throws the canonical message", () => {
      expect(products.requireProductBlank("blank1")).toEqual(
        definition.blanks[0],
      );
      expect(() => products.requireProductBlank("blank9")).toThrow(
        "Blank blank9 not found",
      );
      expect(() => products.requireProductBlank("nope")).toThrow(
        "Blank nope not found",
      );
    });
  });

  describe("describe", () => {
    it("delegates to the composed catalogue for the label", () => {
      const blank: Blank = {
        id: "blank1",
        colorId: "cream",
        sizeId: "small",
        stock: 5,
      };
      expect(products.describe(blank)).toBe(catalogue.describe(blank));
      expect(products.describe(blank)).toBe("Cream Small");
    });
  });

  describe("blankOptions", () => {
    it("returns every colour x size the product offers as BlankOption[]", () => {
      expect(products.blankOptions()).toEqual([
        { blankId: "blank1", color: colors[0], size: sizes[0] },
        { blankId: "blank2", color: colors[0], size: sizes[1] },
      ]);
    });
  });
});
