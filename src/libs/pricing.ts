import { Money, type Price } from "@/libs/money";
import { ProductCatalogue } from "@/libs/product-catalogue";
import type { ProductDefinition, ProductOrderItem } from "./product.types";

export type PriceModifier = {
  value: number;
  type: "fixed" | "percentage";
};

type PriceRule = (context: {
  products: ProductCatalogue;
  definition: ProductDefinition;
  /** The family base price, lifted once so every rule modifies the same value. */
  base: Money;
}) => (item: ProductOrderItem) => Money;

const applyModifier = (base: Money, modifier: PriceModifier): Money =>
  modifier.type === "fixed"
    ? Money.of(modifier.value, base.currency)
    : base.times(modifier.value / 100);

const blankPrice: PriceRule =
  ({ products, base }) =>
  (item) =>
    applyModifier(
      base,
      products.requireProductBlank(item.blankId).priceModifier,
    );

const patternPrice: PriceRule =
  ({ products, base }) =>
  (item) =>
    applyModifier(
      base,
      products.requirePatternVariant(item.patternId).pattern.priceModifier,
    );

const yarnPrice: PriceRule =
  ({ products, base }) =>
  (item) =>
    item.yarnColorIds.reduce((total, yarnColorId) => {
      const yarnColor = products.requireYarnColor(yarnColorId);
      return total.add(applyModifier(base, yarnColor.priceModifier));
    }, Money.zero(base.currency));

const customisationPrice: PriceRule =
  ({ definition, base }) =>
  (item) =>
    item.customisation
      ? applyModifier(base, definition.customisation.priceModifier)
      : Money.zero(base.currency);

export class PricingManager {
  private rules: ((item: ProductOrderItem) => Money)[];
  private base: Money;

  constructor(definition: ProductDefinition) {
    this.base = Money.from(definition.price);
    const context = {
      products: new ProductCatalogue(definition),
      definition,
      base: this.base,
    };
    this.rules = [blankPrice, patternPrice, yarnPrice, customisationPrice].map(
      (rule) => rule(context),
    );
  }

  calculate(item: ProductOrderItem): Price {
    return this.rules
      .reduce((total, rule) => total.add(rule(item)), this.base)
      .toPrice();
  }
}
