import { describe, expect, it } from "vitest";
import { ConfigurationModel } from "./configuration";
import type { ProductDefinition } from "./product.types";

const noModifier = { value: 0, type: "fixed" } as const;

// Fixture resolves stock through the real blank catalogue (getBlankById):
//   cream / small = blank1 (stock 5), cream / large = blank3 (stock 0).
const definition: ProductDefinition = {
  id: "test-product",
  price: { amount: 10000, currency: "SEK" },
  blanks: [
    { blankId: "blank1", priceModifier: noModifier }, // cream / small, stock 5
    { blankId: "blank3", priceModifier: noModifier }, // cream / large, stock 0
  ],
  patternVariants: [
    {
      pattern: {
        id: "plain",
        name: "Plain",
        description: "",
        priceModifier: { value: 5000, type: "fixed" },
      },
      compatibleBlankIds: ["blank1", "blank3"],
      allowedYarnCount: 2,
    },
    {
      pattern: {
        id: "festive",
        name: "Festive",
        description: "",
        priceModifier: noModifier,
      },
      // Only compatible with blank3 (cream / large), which is out of stock.
      compatibleBlankIds: ["blank3"],
      allowedYarnCount: 1,
    },
  ],
  availableYarnColours: [
    { id: "yarnOk", name: "Ok", available: true, priceModifier: noModifier },
    {
      id: "yarnUnavail",
      name: "Unavailable",
      available: false,
      priceModifier: noModifier,
    },
  ],
  customisation: { allowText: false, maxLength: 0, priceModifier: noModifier },
};

describe("ConfigurationModel.sizeOptions", () => {
  it("disables a size whose blank is out of stock", () => {
    const model = new ConfigurationModel(definition, "cream");
    const sizes = model.sizeOptions();

    const large = sizes.find((s) => s.id === "large");
    const small = sizes.find((s) => s.id === "small");

    expect(large?.disabled).toBe(true);
    expect(small?.disabled).toBe(false);
  });
});

describe("ConfigurationModel.patternOptions", () => {
  it("disables a pattern whose only compatible blank is out of stock", () => {
    const model = new ConfigurationModel(definition, "cream");
    const patterns = model.patternOptions();

    const festive = patterns.find((p) => p.id === "festive");
    const plain = patterns.find((p) => p.id === "plain");

    expect(festive?.disabled).toBe(true);
    expect(plain?.disabled).toBe(false);
  });
});

describe("ConfigurationModel.yarnOptions", () => {
  it("disables an unavailable yarn colour", () => {
    const model = new ConfigurationModel(definition, "cream").select({
      sizeId: "small",
      patternId: "plain",
    });
    const yarns = model.yarnOptions();

    const ok = yarns.find((y) => y.id === "yarnOk");
    const unavailable = yarns.find((y) => y.id === "yarnUnavail");

    expect(unavailable?.disabled).toBe(true);
    expect(ok?.disabled).toBe(false);
  });

  it("keeps an already-selected yarn enabled at the pattern's allowedYarnCount", () => {
    // "plain" allows 1 yarn; once yarnOk is chosen it must stay de-selectable
    // rather than lock as disabled+checked.
    const model = new ConfigurationModel(definition, "cream").select({
      sizeId: "small",
      patternId: "plain",
      yarnColorIds: ["yarnOk"],
    });

    const selected = model.yarnOptions().find((y) => y.id === "yarnOk");
    expect(selected?.disabled).toBe(false);
  });
});

describe("ConfigurationModel.price", () => {
  it("is null until both size and pattern are selected", () => {
    const model = new ConfigurationModel(definition, "cream");

    expect(model.price()).toBeNull();
    expect(model.select({ sizeId: "small" }).price()).toBeNull();
  });

  it("reflects the configured total once size and pattern are selected", () => {
    const model = new ConfigurationModel(definition, "cream").select({
      sizeId: "small",
      patternId: "plain",
    });

    // base 10000 (SEK) + plain pattern's fixed 5000 modifier, no yarn/text.
    expect(model.price()).toEqual({ amount: 15000, currency: "SEK" });
  });
});

describe("ConfigurationModel.orderItem", () => {
  it("is null until the selection is complete", () => {
    expect(new ConfigurationModel(definition, "cream").orderItem()).toBeNull();
  });

  it("is null when a completed selection is not valid", () => {
    // large = blank3, which is out of stock.
    const model = new ConfigurationModel(definition, "cream").select({
      sizeId: "large",
      patternId: "plain",
    });

    expect(model.orderItem()).toBeNull();
  });

  it("returns the configured item when complete and valid", () => {
    const model = new ConfigurationModel(definition, "cream").select({
      sizeId: "small",
      patternId: "plain",
    });

    expect(model.orderItem()).toEqual({
      blankId: "blank1",
      patternId: "plain",
      yarnColorIds: [],
      customisation: "",
    });
  });
});

describe("ConfigurationModel.deadEnd", () => {
  it("returns null when the selection can still be completed", () => {
    const model = new ConfigurationModel(definition, "cream").select({
      patternId: "plain",
    });

    expect(model.deadEnd()).toBeNull();
  });

  it("flags the pattern to reset when no size can complete it", () => {
    // festive only fits blank3 (cream / large), which is out of stock, so no
    // size in cream can complete a festive order.
    const model = new ConfigurationModel(definition, "cream").select({
      patternId: "festive",
    });

    expect(model.deadEnd()?.reset).toBe("patternId");
  });
});
