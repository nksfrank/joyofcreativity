import { describe, expect, it } from "vitest";
import type { StockSnapshot } from "./blank.types";
import { ConfigurationModel } from "./configuration";
import type { PatternVariant, ProductDefinition } from "./product.types";

// The priceable trio now lives behind one nullable `ready`; these read a single
// member back as its own nullable so the null-until-ready assertions stay terse.
const price = (model: ConfigurationModel) => model.view().ready?.price ?? null;
const orderItem = (model: ConfigurationModel) =>
  model.view().ready?.orderItem ?? null;

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

// Stock is now an explicit input (#58), injected as a Map<blankId, onHand> rather
// than read from the fixture. This snapshot mirrors the fixture the model used to
// reach into: cream / small (blank1) in stock, cream / large (blank3) sold out.
const stock: StockSnapshot = new Map([
  ["blank1", 5],
  ["blank3", 0],
]);

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
    expect(
      ConfigurationModel.defaultSelection(singleSizeDefinition, "cream").sizeId,
    ).toBe("small");
  });

  it("pre-selects the sole pattern the family offers", () => {
    expect(
      ConfigurationModel.defaultSelection(bareDefinition, "cream").patternId,
    ).toBe("plain");
  });

  it("pre-selects both size and pattern for a single-option family", () => {
    const selection = ConfigurationModel.defaultSelection(
      soloDefinition,
      "cream",
    );

    expect(selection.sizeId).toBe("small");
    expect(selection.patternId).toBe("plain");
  });

  it("does not auto-select a size when more than one is offered, even if only one is in stock", () => {
    // cream offers small (stock 5) and large (stock 0): a real choice exists
    // structurally, so no size is auto-decided just because large is sold out.
    expect(
      ConfigurationModel.defaultSelection(definition, "cream").sizeId,
    ).toBeUndefined();
  });

  it("does not auto-select a pattern when the family offers more than one", () => {
    expect(
      ConfigurationModel.defaultSelection(definition, "cream").patternId,
    ).toBeUndefined();
  });

  it("leaves yarn empty; single-available yarn fields auto-resolve in yarnFields", () => {
    expect(
      ConfigurationModel.defaultSelection(soloDefinition, "cream").yarnColorIds,
    ).toEqual([]);
  });
});

describe("ConfigurationModel.sizeOptions", () => {
  it("disables a size whose blank is out of stock", () => {
    const model = new ConfigurationModel(definition, "cream", stock);
    const sizes = model.view().sizeOptions;

    const large = sizes.find((s) => s.id === "large");
    const small = sizes.find((s) => s.id === "small");

    expect(large?.disabled).toBe(true);
    expect(small?.disabled).toBe(false);
  });

  it("derives disabling from the injected snapshot, not the fixture", () => {
    // Invert the fixture: small (blank1) sold out, large (blank3) restocked.
    const model = new ConfigurationModel(
      definition,
      "cream",
      new Map([
        ["blank1", 0],
        ["blank3", 4],
      ]),
    );
    const sizes = model.view().sizeOptions;

    expect(sizes.find((s) => s.id === "small")?.disabled).toBe(true);
    expect(sizes.find((s) => s.id === "large")?.disabled).toBe(false);
  });
});

describe("ConfigurationModel.patternOptions", () => {
  it("disables a pattern whose only compatible blank is out of stock", () => {
    const model = new ConfigurationModel(definition, "cream", stock);
    const patterns = model.view().patternOptions;

    const festiveOption = patterns.find((p) => p.id === "festive");
    const plainOption = patterns.find((p) => p.id === "plain");

    expect(festiveOption?.disabled).toBe(true);
    expect(plainOption?.disabled).toBe(false);
  });

  it("re-enables a pattern once the injected snapshot restocks its only blank", () => {
    // festive fits only blank3; feasibility now reads the snapshot, so restocking
    // blank3 there makes festive feasible without touching the fixture.
    const model = new ConfigurationModel(
      definition,
      "cream",
      new Map([
        ["blank1", 5],
        ["blank3", 2],
      ]),
    );
    const festiveOption = model
      .view()
      .patternOptions.find((p) => p.id === "festive");

    expect(festiveOption?.disabled).toBe(false);
  });

  it("disables a pattern that requires yarn when no yarn colour is available", () => {
    // plain needs 2 yarns but nothing is available: no completion can fill it.
    const model = new ConfigurationModel(noYarnDefinition, "cream", stock);
    const plainOption = model
      .view()
      .patternOptions.find((p) => p.id === "plain");

    expect(plainOption?.disabled).toBe(true);
  });

  it("enables a plain-knit pattern (requiredYarnCount 0) with no yarn available", () => {
    const model = new ConfigurationModel(
      { ...noYarnDefinition, patternVariants: [plain(0)] },
      "cream",
      stock,
    );
    const plainOption = model
      .view()
      .patternOptions.find((p) => p.id === "plain");

    expect(plainOption?.disabled).toBe(false);
  });
});

describe("ConfigurationModel.yarnFields", () => {
  it("has no fields until a pattern is chosen", () => {
    expect(
      new ConfigurationModel(definition, "cream", stock).view().yarnFields,
    ).toEqual([]);
  });

  it("has no fields for a plain-knit pattern (requiredYarnCount 0)", () => {
    const model = new ConfigurationModel(bareDefinition, "cream", stock, {
      patternId: "plain",
    });

    expect(model.view().yarnFields).toEqual([]);
  });

  it("exposes one field per required yarn colour, each offering all available yarns", () => {
    const model = new ConfigurationModel(definition, "cream", stock, {
      patternId: "plain",
    });
    const fields = model.view().yarnFields;

    expect(fields).toHaveLength(2);
    for (const field of fields) {
      expect(field.options.map((o) => o.id)).toEqual(["red", "blue"]);
      expect(field.options.every((o) => !o.disabled)).toBe(true);
    }
  });

  it("leaves a multi-option field unresolved until it is picked", () => {
    const model = new ConfigurationModel(definition, "cream", stock, {
      patternId: "plain",
      yarnColorIds: ["red"],
    });
    const fields = model.view().yarnFields;

    expect(fields.at(0)?.selectedId).toBe("red");
    expect(fields.at(1)?.selectedId).toBeUndefined();
  });

  it("auto-resolves every field when a single yarn colour is available", () => {
    const model = new ConfigurationModel(soleYarnDefinition, "cream", stock, {
      patternId: "plain",
    });
    const fields = model.view().yarnFields;

    expect(fields).toHaveLength(2);
    expect(fields.map((f) => f.selectedId)).toEqual(["red", "red"]);
  });
});

describe("ConfigurationModel.price", () => {
  it("is null until both size and pattern are selected", () => {
    const model = new ConfigurationModel(definition, "cream", stock);

    expect(price(model)).toBeNull();
    expect(
      price(
        new ConfigurationModel(definition, "cream", stock, { sizeId: "small" }),
      ),
    ).toBeNull();
  });

  it("is null until every required yarn field is filled", () => {
    const model = new ConfigurationModel(definition, "cream", stock, {
      sizeId: "small",
      patternId: "plain",
      yarnColorIds: ["red"], // only one of the two required fields
    });

    expect(price(model)).toBeNull();
  });

  it("is null when a completed selection is not valid", () => {
    // large = blank3, which is out of stock, so a complete selection still prices null.
    const model = new ConfigurationModel(definition, "cream", stock, {
      sizeId: "large",
      patternId: "plain",
      yarnColorIds: ["red", "blue"],
    });

    expect(price(model)).toBeNull();
  });

  it("reflects each filled yarn field, including a repeated colour", () => {
    const model = new ConfigurationModel(definition, "cream", stock, {
      sizeId: "small",
      patternId: "plain",
      yarnColorIds: ["red", "red"],
    });

    // base 10000 + plain 5000 + two red yarns at 2000 each.
    expect(price(model)).toEqual({
      amount: 19000,
      currency: "SEK",
    });
  });

  it("prices an auto-resolved single-yarn pattern without an explicit pick", () => {
    const model = new ConfigurationModel(soleYarnDefinition, "cream", stock, {
      sizeId: "small",
      patternId: "plain",
    });

    // both fields auto-resolve to red: base 10000 + plain 5000 + 2 x 2000.
    expect(price(model)).toEqual({
      amount: 19000,
      currency: "SEK",
    });
  });
});

describe("ConfigurationModel.orderItem", () => {
  it("is null until the selection is complete", () => {
    expect(
      orderItem(new ConfigurationModel(definition, "cream", stock)),
    ).toBeNull();
  });

  it("is null until every required yarn field is filled", () => {
    const model = new ConfigurationModel(definition, "cream", stock, {
      sizeId: "small",
      patternId: "plain",
      yarnColorIds: ["red"],
    });

    expect(orderItem(model)).toBeNull();
  });

  it("is null when a completed selection is not valid", () => {
    // large = blank3, which is out of stock.
    const model = new ConfigurationModel(definition, "cream", stock, {
      sizeId: "large",
      patternId: "plain",
      yarnColorIds: ["red", "blue"],
    });

    expect(orderItem(model)).toBeNull();
  });

  it("returns the configured item when complete and valid, allowing a repeated colour", () => {
    const model = new ConfigurationModel(definition, "cream", stock, {
      sizeId: "small",
      patternId: "plain",
      yarnColorIds: ["red", "red"],
    });

    expect(orderItem(model)).toEqual({
      blankId: "blank1",
      patternId: "plain",
      yarnColorIds: ["red", "red"],
      customisation: "",
    });
  });

  it("resolves from auto-selected yarn fields without an explicit pick", () => {
    const model = new ConfigurationModel(soleYarnDefinition, "cream", stock, {
      sizeId: "small",
      patternId: "plain",
    });

    expect(orderItem(model)).toEqual({
      blankId: "blank1",
      patternId: "plain",
      yarnColorIds: ["red", "red"],
      customisation: "",
    });
  });
});

describe("ConfigurationModel.deadEnd", () => {
  it("returns null when the selection can still be completed", () => {
    const model = new ConfigurationModel(definition, "cream", stock, {
      patternId: "plain",
    });

    expect(model.view().deadEnd).toBeNull();
  });

  it("flags the pattern to reset when no size can complete it", () => {
    // festive only fits blank3 (cream / large), which is out of stock, so no
    // size in cream can complete a festive order.
    const model = new ConfigurationModel(definition, "cream", stock, {
      patternId: "festive",
    });

    expect(model.view().deadEnd?.reset).toBe("patternId");
  });
});

describe("ConfigurationModel.view", () => {
  it("keeps orderItem, price, and labels together under one nullable `ready`", () => {
    // Incomplete: the whole trio is absent, not three independently-null fields.
    expect(
      new ConfigurationModel(definition, "cream", stock).view().ready,
    ).toBeNull();

    // Complete + valid: the trio resolves together and labels name every domain
    // choice, so the island never reads the ProductDefinition (ADR-0005).
    const ready = new ConfigurationModel(definition, "cream", stock, {
      sizeId: "small",
      patternId: "plain",
      yarnColorIds: ["red", "blue"],
    }).view().ready;

    expect(ready).toEqual({
      orderItem: {
        blankId: "blank1",
        patternId: "plain",
        yarnColorIds: ["red", "blue"],
        customisation: "",
      },
      price: { amount: 19000, currency: "SEK" },
      labels: { size: "Small", pattern: "Plain", yarnColours: ["Red", "Blue"] },
    });
  });

  it("exposes the customisation rule so the island never reads the definition", () => {
    const view = new ConfigurationModel(definition, "cream", stock).view();

    expect(view.customisationRule).toEqual(definition.customisation);
  });
});
