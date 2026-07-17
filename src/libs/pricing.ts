import type { Locale } from "@/i18n/runtime";
import { ProductCatalogue } from "@/libs/product-catalogue";
import { assert } from "@/utils/assert";
import type { ProductDefinition, ProductOrderItem } from "./product.types";

/** Integer amount in minor units (e.g. öre, cents) — never a fractional major-unit value. */
export type PriceValue = number;
export type Price = {
  amount: PriceValue;
  currency: CurrencyCode;
};
export type CurrencyCode = "SEK" | "EUR";
export type PriceModifier = {
  value: number;
  type: "fixed" | "percentage";
};

type PriceRule = (
  definition: ProductDefinition,
) => (item: ProductOrderItem) => PriceValue;

const applyModifier = (
  basePrice: Price,
  modifier: PriceModifier,
): PriceValue =>
  modifier.type === "fixed"
    ? modifier.value
    : Math.round((basePrice.amount * modifier.value) / 100);

const blankPrice: PriceRule = (definition) => {
  const products = new ProductCatalogue(definition);
  return (item) => {
    const blank = products.requireOfferedBlank(item.blankId);
    const productBlank = definition.blanks.find(
      (pb) => pb.blankId === blank.id,
    );
    assert(productBlank, `Blank ${blank.id} not offered by this product`);
    return applyModifier(definition.price, productBlank.priceModifier);
  };
};

const patternPrice: PriceRule = (definition) => {
  const products = new ProductCatalogue(definition);
  return (item) => {
    const variant = products.requirePatternVariant(item.patternId);
    return applyModifier(definition.price, variant.pattern.priceModifier);
  };
};

const yarnPrice: PriceRule = (definition) => {
  const products = new ProductCatalogue(definition);
  return (item) =>
    item.yarnColorIds.reduce((total, yarnColorId) => {
      const yarnColor = products.requireYarnColor(yarnColorId);
      return total + applyModifier(definition.price, yarnColor.priceModifier);
    }, 0);
};

const customisationPrice: PriceRule = (definition) => (item) =>
  item.customisation
    ? applyModifier(definition.price, definition.customisation.priceModifier)
    : 0;

export class PricingManager {
  private rules: ((item: ProductOrderItem) => PriceValue)[];
  private base: Price;

  constructor(definition: ProductDefinition) {
    this.base = definition.price;
    this.rules = [blankPrice, patternPrice, yarnPrice, customisationPrice].map(
      (rule) => rule(definition),
    );
  }

  calculate(item: ProductOrderItem): Price {
    const amount = this.rules.reduce(
      (total, rule) => total + rule(item),
      this.base.amount,
    );
    return { amount, currency: this.base.currency };
  }
}

// SEK and EUR both use 2 decimal places; revisit if a zero-decimal currency is added.
const MINOR_UNITS_PER_MAJOR = 100;
const MAJOR_UNIT_DECIMALS = Math.log10(MINOR_UNITS_PER_MAJOR);

/** The price in major units (e.g. 79900 öre → 799). */
const toMajorUnits = (price: Price): number =>
  price.amount / MINOR_UNITS_PER_MAJOR;

export const formatMoney = (price: Price, locale: Locale): string =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency,
  }).format(toMajorUnits(price));

/**
 * The bare major-unit amount as a fixed-decimal string, e.g. "799.00" — no
 * currency symbol or locale grouping. For machine formats (schema.org / JSON-LD)
 * that carry the currency separately; use formatMoney for human display.
 */
export const formatPriceAmount = (price: Price): string =>
  toMajorUnits(price).toFixed(MAJOR_UNIT_DECIMALS);
