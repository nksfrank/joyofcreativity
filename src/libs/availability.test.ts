import { describe, expect, it } from "vitest";
import { AvailabilityManager } from "./availability";
import type { ProductDefinition, ProductOrderItem } from "./product.types";

const noModifier = { value: 0, type: "fixed" } as const;

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
      requiredYarnCount: 2,
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

describe("patternYarnCountValid (exact-count rule)", () => {
  // "Twin" requires exactly 2 yarn colours.
  it("rejects fewer than requiredYarnCount yarn colors", () => {
    const failures = new AvailabilityManager(definition).check(
      itemWithYarns(["yarn1"]),
    );
    expect(failures).toContainEqual(
      expect.objectContaining({
        ok: false,
        reason: "Pattern Twin requires exactly 2 yarn colors",
      }),
    );
  });

  it("passes at exactly requiredYarnCount yarn colors", () => {
    expect(
      new AvailabilityManager(definition).isAvailable(
        itemWithYarns(["yarn1", "yarn2"]),
      ),
    ).toBe(true);
  });

  it("passes at exactly requiredYarnCount when a colour is repeated", () => {
    expect(
      new AvailabilityManager(definition).isAvailable(
        itemWithYarns(["yarn1", "yarn1"]),
      ),
    ).toBe(true);
  });

  it("rejects more than requiredYarnCount yarn colors", () => {
    const failures = new AvailabilityManager(definition).check(
      itemWithYarns(["yarn1", "yarn2", "yarn3"]),
    );
    expect(failures).toContainEqual(
      expect.objectContaining({
        ok: false,
        reason: "Pattern Twin requires exactly 2 yarn colors",
      }),
    );
  });
});

describe("customisation rules", () => {
  // Carry exactly requiredYarnCount (2) valid yarns so only the customisation
  // rule can fail — the exact-count and yarn-availability rules stay satisfied.
  const withCustomisation = (customisation: string): ProductOrderItem => ({
    ...itemWithYarns(["yarn1", "yarn2"]),
    customisation,
  });

  // definition above forbids text (allowText:false, maxLength:0).
  it("gives a single clear reason when text is forbidden (no bogus max-length reason)", () => {
    const failures = new AvailabilityManager(definition).check(
      withCustomisation("hello"),
    );
    expect(failures).toEqual([
      expect.objectContaining({
        ok: false,
        reason: "Customisation is not allowed for this product",
      }),
    ]);
  });

  it("passes when a text-forbidding product is given empty text", () => {
    expect(
      new AvailabilityManager(definition).isAvailable(withCustomisation("")),
    ).toBe(true);
  });

  const textAllowed: ProductDefinition = {
    ...definition,
    customisation: { allowText: true, maxLength: 3, priceModifier: noModifier },
  };

  it("allows text within maxLength when text is permitted", () => {
    expect(
      new AvailabilityManager(textAllowed).isAvailable(
        withCustomisation("abc"),
      ),
    ).toBe(true);
  });

  it("rejects text exceeding maxLength when text is permitted", () => {
    const failures = new AvailabilityManager(textAllowed).check(
      withCustomisation("abcd"),
    );
    expect(failures).toEqual([
      expect.objectContaining({
        ok: false,
        reason: "Customisation exceeds maximum length of 3",
      }),
    ]);
  });
});
