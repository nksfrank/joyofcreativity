import { describe, expect, it } from "vitest";
import type { Blank, Color, Size } from "./blank.types";
import { Catalogue } from "./catalogue";

// A tiny injected fixture — the Catalogue creates none of its own data.
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
  { id: "blank2", colorId: "red", sizeId: "large", stock: 0 },
];

const catalogue = new Catalogue({ colors, sizes, blanks });

describe("Catalogue", () => {
  describe("get vs require", () => {
    it("get returns the entity when present, undefined when absent", () => {
      expect(catalogue.getBlank("blank1")).toEqual(blanks[0]);
      expect(catalogue.getColor("cream")).toEqual(colors[0]);
      expect(catalogue.getSize("small")).toEqual(sizes[0]);

      expect(catalogue.getBlank("nope")).toBeUndefined();
      expect(catalogue.getColor("nope")).toBeUndefined();
      expect(catalogue.getSize("nope")).toBeUndefined();
    });

    it("require returns the entity when present", () => {
      expect(catalogue.requireBlank("blank1")).toEqual(blanks[0]);
      expect(catalogue.requireColor("cream")).toEqual(colors[0]);
      expect(catalogue.requireSize("small")).toEqual(sizes[0]);
    });

    it("require throws the canonical not-found message when absent", () => {
      expect(() => catalogue.requireBlank("nope")).toThrow(
        "Blank nope not found",
      );
      expect(() => catalogue.requireColor("nope")).toThrow(
        "Color nope not found",
      );
      expect(() => catalogue.requireSize("nope")).toThrow(
        "Size nope not found",
      );
    });
  });

  describe("the blank -> (color, size) join", () => {
    it("blankOption returns the BlankOption shape", () => {
      expect(catalogue.blankOption("blank1")).toEqual({
        blankId: "blank1",
        color: colors[0],
        size: sizes[0],
      });
    });

    it("blankOption throws the canonical message for a missing blank", () => {
      expect(() => catalogue.blankOption("nope")).toThrow(
        "Blank nope not found",
      );
    });

    it("describe returns the human label", () => {
      expect(
        catalogue.describe({
          id: "blank1",
          colorId: "cream",
          sizeId: "small",
          stock: 5,
        }),
      ).toBe("Cream Small");
      expect(
        catalogue.describe({
          id: "blank2",
          colorId: "red",
          sizeId: "large",
          stock: 0,
        }),
      ).toBe("Red Large");
    });

    it("describe omits missing parts, matching describeBlank's tolerance", () => {
      expect(
        catalogue.describe({
          id: "x",
          colorId: "cream",
          sizeId: "gone",
          stock: 0,
        }),
      ).toBe("Cream");
      expect(
        catalogue.describe({
          id: "x",
          colorId: "gone",
          sizeId: "gone",
          stock: 0,
        }),
      ).toBe("");
    });
  });
});
