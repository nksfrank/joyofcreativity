import { describe, expect, it } from "vitest";
import { ConfigurationModel } from "./configuration";
import type { PatternVariant, ProductDefinition } from "./product.types";

const noModifier = { value: 0, type: "fixed" } as const;
const yarnModifier = { value: 2000, type: "fixed" } as const;
const plainModifier = { value: 5000, type: "fixed" } as const;

const plain = (requiredYarnCount: number): PatternVariant => ({
  pattern: {
    id: "plain",
    name: "Plain",
    description: "",
    priceModifier: plainModifier,
  },
  compatibleBlankIds: ["blank1", "blank3"],
  requiredYarnCount,
});

// Only compatible with blank3 (cream / large), which is out of stock.
const festive: PatternVariant = {
  pattern: {
    id: "festive",
    name: "Festive",
    description: "",
    priceModifier: noModifier,
  },
  compatibleBlankIds: ["blank3"],
  requiredYarnCount: 1,
};

// Fixture resolves stock through the real blank catalogue (getBlankById):
//   cream / small = blank1 (stock 5), cream / large = blank3 (stock 0).
// Base pattern "plain" requires two yarn colours; "red" and "blue" are available,
// "moss" is offered but discontinued (available: false) so no field offers it.
const definition: ProductDefinition = {
  id: "test-product",
  price: { amount: 10000, currency: "SEK" },
  blanks: [
    { blankId: "blank1", priceModifier: noModifier }, // cream / small, stock 5
    { blankId: "blank3", priceModifier: noModifier }, // cream / large, stock 0
  ],
  patternVariants: [plain(2), festive],
  availableYarnColours: [
    { id: "red", name: "Red", available: true, priceModifier: yarnModifier },
    { id: "blue", name: "Blue", available: true, priceModifier: yarnModifier },
    { id: "moss", name: "Moss", available: false, priceModifier: yarnModifier },
  ],
  customisation: { allowText: false, maxLength: 0, priceModifier: noModifier },
};

/** definition with a single available yarn colour, so every field auto-resolves. */
const soleYarnDefinition: ProductDefinition = {
  ...definition,
  availableYarnColours: [
    { id: "red", name: "Red", available: true, priceModifier: yarnModifier },
    { id: "moss", name: "Moss", available: false, priceModifier: yarnModifier },
  ],
};

/** definition whose only pattern needs yarn but has no available yarn colour. */
const noYarnDefinition: ProductDefinition = {
  ...definition,
  patternVariants: [plain(2)],
  availableYarnColours: [
    { id: "moss", name: "Moss", available: false, priceModifier: yarnModifier },
  ],
};

/** definition whose pattern is a plain knit needing no yarn (requiredYarnCount 0). */
const bareDefinition: ProductDefinition = {
  ...definition,
  patternVariants: [plain(0)],
};

/** definition offered in cream in a single size (blank1, small), all else shared. */
const singleSizeDefinition: ProductDefinition = {
  ...definition,
  blanks: [{ blankId: "blank1", priceModifier: noModifier }],
};

/** definition offering a single pattern (and cream small only), so both auto-select. */
const soloDefinition: ProductDefinition = {
  ...definition,
  blanks: [{ blankId: "blank1", priceModifier: noModifier }],
  patternVariants: [plain(2)],
};

describe("ConfigurationModel.defaultSelection", () => {
  it("pre-selects the sole size a colour is offered in", () => {
    const model = new ConfigurationModel(singleSizeDefinition, "cream");

    expect(model.defaultSelection().sizeId).toBe("small");
  });

  it("pre-selects the sole pattern the family offers", () => {
    const model = new ConfigurationModel(bareDefinition, "cream");

    expect(model.defaultSelection().patternId).toBe("plain");
  });

  it("pre-selects both size and pattern for a single-option family", () => {
    const selection = new ConfigurationModel(
      soloDefinition,
      "cream",
    ).defaultSelection();

    expect(selection.sizeId).toBe("small");
    expect(selection.patternId).toBe("plain");
  });

  it("does not auto-select a size when more than one is offered, even if only one is in stock", () => {
    // cream offers small (stock 5) and large (stock 0): a real choice exists
    // structurally, so no size is auto-decided just because large is sold out.
    const model = new ConfigurationModel(definition, "cream");

    expect(model.defaultSelection().sizeId).toBeUndefined();
  });

  it("does not auto-select a pattern when the family offers more than one", () => {
    const model = new ConfigurationModel(definition, "cream");

    expect(model.defaultSelection().patternId).toBeUndefined();
  });

  it("leaves yarn empty; single-available yarn fields auto-resolve in yarnFields", () => {
    const model = new ConfigurationModel(soloDefinition, "cream");

    expect(model.defaultSelection().yarnColorIds).toEqual([]);
  });
});

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

    const festiveOption = patterns.find((p) => p.id === "festive");
    const plainOption = patterns.find((p) => p.id === "plain");

    expect(festiveOption?.disabled).toBe(true);
    expect(plainOption?.disabled).toBe(false);
  });

  it("disables a pattern that requires yarn when no yarn colour is available", () => {
    // plain needs 2 yarns but nothing is available: no completion can fill it.
    const model = new ConfigurationModel(noYarnDefinition, "cream");
    const plainOption = model.patternOptions().find((p) => p.id === "plain");

    expect(plainOption?.disabled).toBe(true);
  });

  it("enables a plain-knit pattern (requiredYarnCount 0) with no yarn available", () => {
    const model = new ConfigurationModel(
      { ...noYarnDefinition, patternVariants: [plain(0)] },
      "cream",
    );
    const plainOption = model.patternOptions().find((p) => p.id === "plain");

    expect(plainOption?.disabled).toBe(false);
  });
});

describe("ConfigurationModel.yarnFields", () => {
  it("has no fields until a pattern is chosen", () => {
    expect(new ConfigurationModel(definition, "cream").yarnFields()).toEqual(
      [],
    );
  });

  it("has no fields for a plain-knit pattern (requiredYarnCount 0)", () => {
    const model = new ConfigurationModel(bareDefinition, "cream").select({
      patternId: "plain",
    });

    expect(model.yarnFields()).toEqual([]);
  });

  it("exposes one field per required yarn colour, each offering all available yarns", () => {
    const model = new ConfigurationModel(definition, "cream").select({
      patternId: "plain",
    });
    const fields = model.yarnFields();

    expect(fields).toHaveLength(2);
    for (const field of fields) {
      expect(field.options.map((o) => o.id)).toEqual(["red", "blue"]);
      expect(field.options.every((o) => !o.disabled)).toBe(true);
    }
  });

  it("leaves a multi-option field unresolved until it is picked", () => {
    const model = new ConfigurationModel(definition, "cream").select({
      patternId: "plain",
      yarnColorIds: ["red"],
    });
    const fields = model.yarnFields();

    expect(fields[0]?.selectedId).toBe("red");
    expect(fields[1]?.selectedId).toBeUndefined();
  });

  it("auto-resolves every field when a single yarn colour is available", () => {
    const model = new ConfigurationModel(soleYarnDefinition, "cream").select({
      patternId: "plain",
    });
    const fields = model.yarnFields();

    expect(fields).toHaveLength(2);
    expect(fields.map((f) => f.selectedId)).toEqual(["red", "red"]);
  });
});

describe("ConfigurationModel.price", () => {
  it("is null until both size and pattern are selected", () => {
    const model = new ConfigurationModel(definition, "cream");

    expect(model.price()).toBeNull();
    expect(model.select({ sizeId: "small" }).price()).toBeNull();
  });

  it("is null until every required yarn field is filled", () => {
    const model = new ConfigurationModel(definition, "cream").select({
      sizeId: "small",
      patternId: "plain",
      yarnColorIds: ["red"], // only one of the two required fields
    });

    expect(model.price()).toBeNull();
  });

  it("is null when a completed selection is not valid", () => {
    // large = blank3, which is out of stock, so a complete selection still prices null.
    const model = new ConfigurationModel(definition, "cream").select({
      sizeId: "large",
      patternId: "plain",
      yarnColorIds: ["red", "blue"],
    });

    expect(model.price()).toBeNull();
  });

  it("reflects each filled yarn field, including a repeated colour", () => {
    const model = new ConfigurationModel(definition, "cream").select({
      sizeId: "small",
      patternId: "plain",
      yarnColorIds: ["red", "red"],
    });

    // base 10000 + plain 5000 + two red yarns at 2000 each.
    expect(model.price()).toEqual({ amount: 19000, currency: "SEK" });
  });

  it("prices an auto-resolved single-yarn pattern without an explicit pick", () => {
    const model = new ConfigurationModel(soleYarnDefinition, "cream").select({
      sizeId: "small",
      patternId: "plain",
    });

    // both fields auto-resolve to red: base 10000 + plain 5000 + 2 x 2000.
    expect(model.price()).toEqual({ amount: 19000, currency: "SEK" });
  });
});

describe("ConfigurationModel.orderItem", () => {
  it("is null until the selection is complete", () => {
    expect(new ConfigurationModel(definition, "cream").orderItem()).toBeNull();
  });

  it("is null until every required yarn field is filled", () => {
    const model = new ConfigurationModel(definition, "cream").select({
      sizeId: "small",
      patternId: "plain",
      yarnColorIds: ["red"],
    });

    expect(model.orderItem()).toBeNull();
  });

  it("is null when a completed selection is not valid", () => {
    // large = blank3, which is out of stock.
    const model = new ConfigurationModel(definition, "cream").select({
      sizeId: "large",
      patternId: "plain",
      yarnColorIds: ["red", "blue"],
    });

    expect(model.orderItem()).toBeNull();
  });

  it("returns the configured item when complete and valid, allowing a repeated colour", () => {
    const model = new ConfigurationModel(definition, "cream").select({
      sizeId: "small",
      patternId: "plain",
      yarnColorIds: ["red", "red"],
    });

    expect(model.orderItem()).toEqual({
      blankId: "blank1",
      patternId: "plain",
      yarnColorIds: ["red", "red"],
      customisation: "",
    });
  });

  it("resolves from auto-selected yarn fields without an explicit pick", () => {
    const model = new ConfigurationModel(soleYarnDefinition, "cream").select({
      sizeId: "small",
      patternId: "plain",
    });

    expect(model.orderItem()).toEqual({
      blankId: "blank1",
      patternId: "plain",
      yarnColorIds: ["red", "red"],
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
