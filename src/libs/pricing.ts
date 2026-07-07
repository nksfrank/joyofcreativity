import type { Locale } from "@/i18n/runtime";
import { resolveProductBlank } from "@/libs/product.utils";
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

const blankPrice: PriceRule = (definition) => (item) => {
  const blank = resolveProductBlank(definition, item);
  assert(
    blank,
    `Blank for color ${item.colorId} and size ${item.sizeId} not found`,
  );
  const productBlank = definition.blanks.find((pb) => pb.blankId === blank.id);
  assert(productBlank, `Blank ${blank.id} not offered by this product`);
  return applyModifier(definition.price, productBlank.priceModifier);
};

const patternPrice: PriceRule = (definition) => (item) => {
  const variant = definition.patternVariants.find(
    (variant) => variant.pattern.id === item.patternId,
  );
  assert(variant, `Pattern with id ${item.patternId} not found`);
  return applyModifier(definition.price, variant.pattern.priceModifier);
};

const yarnPrice: PriceRule = (definition) => (item) =>
  item.yarnColorIds.reduce((total, yarnColorId) => {
    const yarnColor = definition.availableYarnColours.find(
      (color) => color.id === yarnColorId,
    );
    assert(yarnColor, `Yarn color with id ${yarnColorId} not found`);
    return total + applyModifier(definition.price, yarnColor.priceModifier);
  }, 0);

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

// SEK and EUR both use 2 decimal places; revisit this divisor if a zero-decimal currency is added.
export const formatMoney = (price: Price, locale: Locale): string =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency,
  }).format(price.amount / 100);
