import { describe, expect, it } from "vitest";
import type { StockSnapshot } from "@/libs/blank.types";
import type { ProductOrderItem } from "@/libs/product.types";
import { type CheckoutRequestLine, classifyCart } from "./checkout";

// Fixture facts (src/libs/product.ts): product "1" offers blank1..blank12, base
// 79900 SEK; pattern "plain" needs 1 yarn, "signature" needs 3; yarn "moss" is
// offered but unavailable. A snapshot marks a blank in stock at a given on-hand.
const line = (
  item: ProductOrderItem,
  quantity = 1,
  productId = "1",
): CheckoutRequestLine => ({ productId, item, quantity });

const plain = (
  overrides: Partial<ProductOrderItem> = {},
): ProductOrderItem => ({
  blankId: "blank1",
  patternId: "plain",
  yarnColorIds: ["ivory"],
  customisation: "",
  ...overrides,
});

const inStock = (blankId: string, onHand: number): StockSnapshot =>
  new Map([[blankId, onHand]]);

describe("classifyCart — four-bucket validation", () => {
  it("prices a good line server-side and reports a single currency", () => {
    const result = classifyCart(
      { lines: [line(plain(), 2)] },
      inStock("blank1", 5),
    );

    if (!result.ok) throw new Error("expected a good cart");
    expect(result.currency).toBe("SEK");
    expect(result.lines).toStrictEqual([
      {
        productId: "1",
        item: plain(),
        quantity: 2,
        // base 79900 + ivory yarn 2000 = 81900
        unitPrice: { amount: 81900, currency: "SEK" },
      },
    ]);
  });

  describe("bucket 1 — tampered / structural", () => {
    it("flags an unknown product", () => {
      const result = classifyCart(
        { lines: [line(plain(), 1, "no-such-product")] },
        new Map(),
      );
      if (result.ok) throw new Error("expected problems");
      expect(result.problems[0]?.bucket).toBe("tampered");
    });

    it("flags a blank the product does not offer", () => {
      const result = classifyCart(
        { lines: [line(plain({ blankId: "blank99" }))] },
        inStock("blank99", 5),
      );
      if (result.ok) throw new Error("expected problems");
      expect(result.problems[0]?.bucket).toBe("tampered");
    });

    it("flags a pattern not on the family", () => {
      const result = classifyCart(
        { lines: [line(plain({ patternId: "no-such-pattern" }))] },
        inStock("blank1", 5),
      );
      if (result.ok) throw new Error("expected problems");
      expect(result.problems[0]?.bucket).toBe("tampered");
    });

    it("flags the wrong yarn count for the chosen pattern", () => {
      // "signature" needs exactly 3 yarn colours; supply 1.
      const result = classifyCart(
        {
          lines: [
            line(plain({ patternId: "signature", yarnColorIds: ["ivory"] })),
          ],
        },
        inStock("blank1", 5),
      );
      if (result.ok) throw new Error("expected problems");
      expect(result.problems[0]?.bucket).toBe("tampered");
    });

    it("flags customisation exceeding the family's max length", () => {
      const result = classifyCart(
        { lines: [line(plain({ customisation: "way too many chars" }))] },
        inStock("blank1", 5),
      );
      if (result.ok) throw new Error("expected problems");
      expect(result.problems[0]?.bucket).toBe("tampered");
    });
  });

  it("bucket 2 — flags a structurally valid but unavailable option", () => {
    // "moss" is offered but unavailable; count is right for "signature" (3).
    const result = classifyCart(
      {
        lines: [
          line(
            plain({
              patternId: "signature",
              yarnColorIds: ["moss", "ivory", "charcoal"],
            }),
          ),
        ],
      },
      inStock("blank1", 5),
    );
    if (result.ok) throw new Error("expected problems");
    expect(result.problems[0]?.bucket).toBe("unavailable");
  });

  it("bucket 3 — flags a valid, available line whose on-hand is below the quantity", () => {
    const result = classifyCart(
      { lines: [line(plain(), 5)] },
      inStock("blank1", 2),
    );
    if (result.ok) throw new Error("expected problems");
    expect(result.problems[0]?.bucket).toBe("out_of_stock");
    expect(result.problems[0]?.reasons[0]).toContain("2 on hand");
  });

  it("treats a blank absent from the snapshot as zero on-hand (out of stock)", () => {
    const result = classifyCart({ lines: [line(plain(), 1)] }, new Map());
    if (result.ok) throw new Error("expected problems");
    expect(result.problems[0]?.bucket).toBe("out_of_stock");
  });

  it("returns every line's problem together, one bucket each", () => {
    const result = classifyCart(
      {
        lines: [
          line(plain({ patternId: "no-such-pattern" })), // tampered
          line(
            plain({
              patternId: "signature",
              yarnColorIds: ["moss", "ivory", "charcoal"],
            }),
          ), // unavailable
          line(plain(), 5), // out of stock (only 2 on hand)
        ],
      },
      inStock("blank1", 2),
    );
    if (result.ok) throw new Error("expected problems");
    expect(result.problems.map((p) => [p.index, p.bucket])).toStrictEqual([
      [0, "tampered"],
      [1, "unavailable"],
      [2, "out_of_stock"],
    ]);
  });
});
