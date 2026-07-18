import { describe, expect, it } from "vitest";
import type { Price } from "@/libs/money";
import {
  type AddLineInput,
  type CartLine,
  cartTotal,
  lineIdentity,
  mergeLine,
} from "./cart";

const price: Price = { amount: 15000, currency: "SEK" };

const baseInput: AddLineInput = {
  productId: "1",
  item: {
    blankId: "blank1",
    patternId: "plain",
    yarnColorIds: ["ivory", "rose"],
    customisation: "AB",
  },
  price,
  display: {
    productName: "Signature Letter Sweater",
    colour: "Cream",
    size: "Small",
    pattern: "Plain",
    yarnColours: ["Ivory", "Rose"],
    customisation: "AB",
  },
};

const input = (over: Partial<AddLineInput["item"]>): AddLineInput => ({
  ...baseInput,
  item: { ...baseInput.item, ...over },
});

describe("mergeLine", () => {
  it("adds a first line with quantity 1", () => {
    const lines = mergeLine([], baseInput);
    expect(lines).toHaveLength(1);
    expect(lines.at(0)?.quantity).toBe(1);
  });

  it("stores price and display as passed (snapshot, not recomputed)", () => {
    const line = mergeLine([], baseInput).at(0);
    expect(line?.price).toEqual(baseInput.price);
    expect(line?.display).toEqual(baseInput.display);
    expect(line?.item).toEqual(baseInput.item);
  });

  it("increments quantity for an identical configuration", () => {
    const lines = mergeLine(mergeLine([], baseInput), baseInput);
    expect(lines).toHaveLength(1);
    expect(lines.at(0)?.quantity).toBe(2);
  });

  it("treats yarn colour order as insensitive when merging", () => {
    const reordered = input({ yarnColorIds: ["rose", "ivory"] });
    const lines = mergeLine(mergeLine([], baseInput), reordered);
    expect(lines).toHaveLength(1);
    expect(lines.at(0)?.quantity).toBe(2);
  });

  it("adds a separate line for a differing blank", () => {
    const lines = mergeLine(
      mergeLine([], baseInput),
      input({ blankId: "blank2" }),
    );
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.quantity === 1)).toBe(true);
  });

  it("adds a separate line for a differing pattern", () => {
    const lines = mergeLine(
      mergeLine([], baseInput),
      input({ patternId: "signature" }),
    );
    expect(lines).toHaveLength(2);
  });

  it("adds a separate line for a differing yarn set", () => {
    const lines = mergeLine(
      mergeLine([], baseInput),
      input({ yarnColorIds: ["ivory"] }),
    );
    expect(lines).toHaveLength(2);
  });

  it("adds a separate line for differing customisation", () => {
    const lines = mergeLine(
      mergeLine([], baseInput),
      input({ customisation: "CD" }),
    );
    expect(lines).toHaveLength(2);
  });
});

const line = (over: Partial<CartLine> = {}): CartLine => ({
  ...baseInput,
  quantity: 1,
  ...over,
});

describe("cartTotal", () => {
  it("is null for an empty cart", () => {
    expect(cartTotal([])).toBeNull();
  });

  it("sums each line's price weighted by its quantity", () => {
    // 15000 × 2 + 15000 × 1 = 45000.
    const total = cartTotal([line({ quantity: 2 }), line()]);
    expect(total?.toPrice()).toEqual({ amount: 45000, currency: "SEK" });
  });

  it("throws on a mixed-currency cart instead of totalling silently", () => {
    const eur = line({ price: { amount: 15000, currency: "EUR" } });
    expect(() => cartTotal([line(), eur])).toThrow(/currenc/i);
  });
});

describe("lineIdentity", () => {
  it("is order-insensitive over yarn colours", () => {
    expect(lineIdentity(baseInput.productId, baseInput.item)).toBe(
      lineIdentity("1", { ...baseInput.item, yarnColorIds: ["rose", "ivory"] }),
    );
  });

  it("differs when any identity field differs", () => {
    const base = lineIdentity(baseInput.productId, baseInput.item);
    expect(lineIdentity("2", baseInput.item)).not.toBe(base);
    expect(
      lineIdentity("1", { ...baseInput.item, blankId: "blank2" }),
    ).not.toBe(base);
    expect(
      lineIdentity("1", { ...baseInput.item, patternId: "signature" }),
    ).not.toBe(base);
    expect(
      lineIdentity("1", { ...baseInput.item, customisation: "CD" }),
    ).not.toBe(base);
  });
});
