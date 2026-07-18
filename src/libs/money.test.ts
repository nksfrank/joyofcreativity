import { describe, expect, it } from "vitest";
import { Money, type Price } from "./money";

describe("Money.of", () => {
  it("rounds a fractional minor-unit amount to the nearest integer", () => {
    // percentage modifiers can produce fractional minor units before rounding.
    expect(Money.of(1000.4, "SEK").amount).toBe(1000);
    expect(Money.of(1000.5, "SEK").amount).toBe(1001);
  });

  it("carries the currency", () => {
    expect(Money.of(500, "EUR").currency).toBe("EUR");
  });
});

describe("Money.zero", () => {
  it("is a zero amount in the given currency", () => {
    const zero = Money.zero("SEK");
    expect(zero.amount).toBe(0);
    expect(zero.currency).toBe("SEK");
  });
});

describe("Money.from / toPrice", () => {
  it("round-trips the serialized Price record", () => {
    const price: Price = { amount: 79900, currency: "SEK" };
    expect(Money.from(price).toPrice()).toEqual(price);
  });
});

describe("add", () => {
  it("sums two amounts of the same currency", () => {
    expect(Money.of(1500, "SEK").add(Money.of(2000, "SEK")).amount).toBe(3500);
  });

  it("throws on a currency mismatch instead of silently coercing", () => {
    expect(() => Money.of(1500, "SEK").add(Money.of(2000, "EUR"))).toThrow(
      /currenc/i,
    );
  });
});

describe("times", () => {
  it("multiplies by an integer quantity", () => {
    expect(Money.of(15000, "SEK").times(3).amount).toBe(45000);
  });

  it("rounds a fractional product to integer minor units", () => {
    // 10% of 10000 minor units expressed as a scalar factor.
    expect(Money.of(10000, "SEK").times(0.1).amount).toBe(1000);
  });
});

describe("format", () => {
  it("renders a localized currency string in major units", () => {
    // Non-breaking spaces vary by ICU version, so assert on the digits + code.
    const formatted = Money.of(79900, "SEK").format("sv");
    expect(formatted).toMatch(/799/);
    expect(formatted).toMatch(/kr|SEK/);
  });
});

describe("amountString", () => {
  it("renders minor units as a bare two-decimal major-unit string", () => {
    expect(Money.of(79900, "SEK").amountString()).toBe("799.00");
    expect(Money.of(5, "EUR").amountString()).toBe("0.05");
    expect(Money.of(0, "SEK").amountString()).toBe("0.00");
  });
});
