import { describe, expect, it } from "vitest";
import type { StockSnapshot } from "@/libs/blank.types";
import { shortfallsIn } from "./stock-gate";

const snapshot = (entries: Record<string, number>): StockSnapshot =>
  new Map(Object.entries(entries));

describe("shortfallsIn — the pure stock predicate", () => {
  it("covers a line whose on-hand meets the quantity", () => {
    expect(
      shortfallsIn(
        [{ blankId: "blank1", quantity: 2 }],
        snapshot({ blank1: 2 }),
      ),
    ).toStrictEqual([]);
  });

  it("flags a line whose on-hand is below the quantity", () => {
    expect(
      shortfallsIn(
        [{ blankId: "blank1", quantity: 3 }],
        snapshot({ blank1: 2 }),
      ),
    ).toStrictEqual([0]);
  });

  it("treats a blank absent from the snapshot as zero on-hand", () => {
    expect(
      shortfallsIn([{ blankId: "missing", quantity: 1 }], snapshot({})),
    ).toStrictEqual([0]);
  });

  it("returns every uncovered line's index, in order", () => {
    const result = shortfallsIn(
      [
        { blankId: "blank1", quantity: 1 }, // covered
        { blankId: "blank2", quantity: 5 }, // short
        { blankId: "blank3", quantity: 1 }, // absent → short
      ],
      snapshot({ blank1: 1, blank2: 2 }),
    );
    expect(result).toStrictEqual([1, 2]);
  });
});
