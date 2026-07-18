import type { Locale } from "@/i18n/runtime";

export type CurrencyCode = "SEK" | "EUR";

/** Integer amount in minor units (e.g. öre, cents) — never a fractional major-unit value. */
export type PriceValue = number;

/**
 * The serialized money shape stored in snapshots (ADR-0004) and content: a bare
 * `{ amount, currency }` record. Arithmetic and formatting live on `Money` — build
 * one with `Money.from` before doing anything but passing the value around.
 */
export type Price = {
  amount: PriceValue;
  currency: CurrencyCode;
};

export type PriceModifier = {
  value: number;
  type: "fixed" | "percentage";
};

// SEK and EUR both use 2 decimal places; revisit if a zero-decimal currency is added.
const MINOR_UNITS_PER_MAJOR = 100;
const MAJOR_UNIT_DECIMALS = Math.log10(MINOR_UNITS_PER_MAJOR);

/**
 * A monetary value in a single currency, held in integer minor units. Owns the
 * minor-unit representation, rounding, and the currency-mismatch guard so no
 * caller has to re-derive them (CONTEXT.md → Money).
 */
export class Money {
  private constructor(
    readonly amount: PriceValue,
    readonly currency: CurrencyCode,
  ) {}

  /** A value in minor units, rounded to the nearest integer (arithmetic can go fractional). */
  static of(amount: number, currency: CurrencyCode): Money {
    return new Money(Math.round(amount), currency);
  }

  /** Lifts a serialized `Price` record into a `Money`. */
  static from(price: Price): Money {
    return new Money(price.amount, price.currency);
  }

  /** The additive identity in a given currency — the starting point for a running total. */
  static zero(currency: CurrencyCode): Money {
    return new Money(0, currency);
  }

  /** Sum of two values; throws on a currency mismatch rather than coercing silently. */
  add(other: Money): Money {
    if (other.currency !== this.currency) {
      throw new Error(
        `Cannot add ${other.currency} to ${this.currency}: currencies must match.`,
      );
    }
    return new Money(this.amount + other.amount, this.currency);
  }

  /** Scales the value by a factor (a quantity or a fractional rate), rounding to minor units. */
  times(factor: number): Money {
    return Money.of(this.amount * factor, this.currency);
  }

  /** A localized currency string in major units, e.g. "799,00 kr". For human display. */
  format(locale: Locale): string {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: this.currency,
    }).format(this.toMajorUnits());
  }

  /**
   * The bare major-unit amount as a fixed-decimal string, e.g. "799.00" — no
   * currency symbol or locale grouping. For machine formats (schema.org / JSON-LD)
   * that carry the currency separately; use `format` for human display.
   */
  amountString(): string {
    return this.toMajorUnits().toFixed(MAJOR_UNIT_DECIMALS);
  }

  /** The serialized record for snapshots and content. */
  toPrice(): Price {
    return { amount: this.amount, currency: this.currency };
  }

  private toMajorUnits(): number {
    return this.amount / MINOR_UNITS_PER_MAJOR;
  }
}
