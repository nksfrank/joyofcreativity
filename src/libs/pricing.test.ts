import { describe, expect, it } from "vitest";
import { PricingManager } from "./pricing";
import type { ProductDefinition, ProductOrderItem } from "./product.types";

const noModifier = { value: 0, type: "fixed" } as const;

// blank1 (cream / small) exists in the real blank catalogue; pricing never reads
// stock, so no snapshot is involved — only the price modifiers matter here.
const definition: ProductDefinition = {
  id: "test-product",
  price: { amount: 10000, currency: "SEK" },
  blanks: [
    { blankId: "blank1", priceModifier: { value: 1500, type: "fixed" } },
  ],
  patternVariants: [
    {
      pattern: {
        id: "plain",
        name: "Plain",
        description: "",
        priceModifier: { value: 5000, type: "fixed" },
      },
      compatibleBlankIds: ["blank1"],
      requiredYarnCount: 2,
    },
  ],
  availableYarnColours: [
    {
      id: "red",
      name: "Red",
      available: true,
      priceModifier: { value: 2000, type: "fixed" },
    },
    {
      id: "blue",
      name: "Blue",
      available: true,
      priceModifier: { value: 2000, type: "fixed" },
    },
  ],
  customisation: {
    allowText: true,
    maxLength: 20,
    priceModifier: { value: 3000, type: "fixed" },
  },
};

const item = (overrides: Partial<ProductOrderItem> = {}): ProductOrderItem => ({
  blankId: "blank1",
  patternId: "plain",
  yarnColorIds: ["red", "blue"],
  customisation: "",
  ...overrides,
});

describe("PricingManager.calculate", () => {
  it("sums base, blank, pattern and every yarn modifier", () => {
    // base 10000 + blank 1500 + pattern 5000 + two yarns at 2000 each.
    expect(new PricingManager(definition).calculate(item())).toEqual({
      amount: 20500,
      currency: "SEK",
    });
  });

  it("counts a repeated yarn colour once per field", () => {
    // base 10000 + blank 1500 + pattern 5000 + red twice at 2000 each.
    expect(
      new PricingManager(definition).calculate(
        item({ yarnColorIds: ["red", "red"] }),
      ),
    ).toEqual({ amount: 20500, currency: "SEK" });
  });

  it("adds the customisation modifier only when text is present", () => {
    expect(
      new PricingManager(definition).calculate(item({ customisation: "hi" }))
        .amount,
    ).toBe(23500);
    expect(
      new PricingManager(definition).calculate(item({ customisation: "" }))
        .amount,
    ).toBe(20500);
  });

  it("carries the base currency through to the result", () => {
    const eur: ProductDefinition = {
      ...definition,
      price: { amount: 10000, currency: "EUR" },
    };
    expect(new PricingManager(eur).calculate(item()).currency).toBe("EUR");
  });

  it("applies a percentage modifier against the family base price", () => {
    // A 10% blank modifier on a 10000 base contributes 1000; plain knit, no yarn.
    const percentage: ProductDefinition = {
      ...definition,
      blanks: [
        { blankId: "blank1", priceModifier: { value: 10, type: "percentage" } },
      ],
      patternVariants: [
        {
          pattern: {
            id: "plain",
            name: "Plain",
            description: "",
            priceModifier: noModifier,
          },
          compatibleBlankIds: ["blank1"],
          requiredYarnCount: 0,
        },
      ],
    };

    // base 10000 + blank 1000 (10% of 10000) + pattern 0 + no yarn.
    expect(
      new PricingManager(percentage).calculate(item({ yarnColorIds: [] }))
        .amount,
    ).toBe(11000);
  });
});
