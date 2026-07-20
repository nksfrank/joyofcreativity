import { describe, expect, it } from "vitest";
import { uuidv7 } from "./id";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidv7", () => {
  it("is a canonical UUID string with version 7 and the RFC variant", () => {
    expect(uuidv7()).toMatch(UUID_RE);
  });

  it("encodes the given timestamp in the leading 48 bits (time-sortable)", () => {
    // Two ids minted a second apart must sort in issue order lexically — the
    // property the public reference relies on (time-sortable, #65).
    const earlier = uuidv7(1_700_000_000_000);
    const later = uuidv7(1_700_000_001_000);
    expect(earlier < later).toBe(true);
  });

  it("puts the exact millisecond into the first 48 bits", () => {
    const now = 0x0123456789ab;
    const id = uuidv7(now);
    const hex = id.replace(/-/g, "").slice(0, 12);
    expect(hex).toBe("0123456789ab");
  });

  it("is non-enumerable: two ids at the same instant differ in their random tail", () => {
    const now = 1_700_000_000_000;
    expect(uuidv7(now)).not.toBe(uuidv7(now));
  });
});
