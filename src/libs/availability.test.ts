import { describe, expect, it } from "vitest";
import { AvailabilityManager } from "./availability";
import type { ProductDefinition, ProductOrderItem } from "./product.types";

const noModifier = { type: "flat", amount: 0 } as const;

// blank1 (cream/small) has stock 5, so blankInStock passes for it.
const definition: ProductDefinition = {
  id: "product1",
  price: { amount: 0, currency: "SEK" } as ProductDefinition["price"],
  blanks: [{ blankId: "blank1", priceModifier: noModifier }],
  patternVariants: [
    {
      pattern: {
        id: "pattern1",
        name: "Twin",
        description: "",
        priceModifier: noModifier,
      },
      compatibleBlankIds: ["blank1"],
      allowedYarnCount: 2,
    },
  ],
  availableYarnColours: [
    { id: "yarn1", name: "Yarn 1", available: true, priceModifier: noModifier },
    { id: "yarn2", name: "Yarn 2", available: true, priceModifier: noModifier },
    { id: "yarn3", name: "Yarn 3", available: true, priceModifier: noModifier },
  ],
  customisation: { allowText: false, maxLength: 0, priceModifier: noModifier },
};

const itemWithYarns = (yarnColorIds: string[]): ProductOrderItem => ({
  blankId: "blank1",
  patternId: "pattern1",
  yarnColorIds,
  customisation: "",
});

describe("patternYarnCountValid", () => {
  it("allows fewer yarn colors than allowedYarnCount", () => {
    expect(new AvailabilityManager(definition).isAvailable(itemWithYarns(["yarn1"]))).toBe(true);
  });

  it("allows exactly allowedYarnCount yarn colors (inclusive boundary)", () => {
    expect(
      new AvailabilityManager(definition).isAvailable(itemWithYarns(["yarn1", "yarn2"])),
    ).toBe(true);
  });

  it("rejects more than allowedYarnCount yarn colors", () => {
    const failures = new AvailabilityManager(definition).check(
      itemWithYarns(["yarn1", "yarn2", "yarn3"]),
    );
    expect(failures).toContainEqual(
      expect.objectContaining({
        ok: false,
        reason: "Pattern Twin allows only 2 yarn colors",
      }),
    );
  });
});
