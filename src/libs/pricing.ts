import { Money, type Price, type PriceModifier } from "@/libs/money";
import { ProductCatalogue } from "@/libs/product-catalogue";
import type { ProductDefinition, ProductOrderItem } from "./product.types";

type PriceRule = (context: {
  products: ProductCatalogue;
  definition: ProductDefinition;
}) => (item: ProductOrderItem) => Money;

const applyModifier = (base: Money, modifier: PriceModifier): Money =>
  modifier.type === "fixed"
    ? Money.of(modifier.value, base.currency)
    : base.times(modifier.value / 100);

const blankPrice: PriceRule = ({ products, definition }) => {
  const base = Money.from(definition.price);
  return (item) => {
    const productBlank = products.requireProductBlank(item.blankId);
    return applyModifier(base, productBlank.priceModifier);
  };
};

const patternPrice: PriceRule = ({ products, definition }) => {
  const base = Money.from(definition.price);
  return (item) => {
    const variant = products.requirePatternVariant(item.patternId);
    return applyModifier(base, variant.pattern.priceModifier);
  };
};

const yarnPrice: PriceRule = ({ products, definition }) => {
  const base = Money.from(definition.price);
  return (item) =>
    item.yarnColorIds.reduce((total, yarnColorId) => {
      const yarnColor = products.requireYarnColor(yarnColorId);
      return total.add(applyModifier(base, yarnColor.priceModifier));
    }, Money.zero(base.currency));
};

const customisationPrice: PriceRule = ({ definition }) => {
  const base = Money.from(definition.price);
  return (item) =>
    item.customisation
      ? applyModifier(base, definition.customisation.priceModifier)
      : Money.zero(base.currency);
};

export class PricingManager {
  private rules: ((item: ProductOrderItem) => Money)[];
  private base: Money;

  constructor(definition: ProductDefinition) {
    this.base = Money.from(definition.price);
    const context = {
      products: new ProductCatalogue(definition),
      definition,
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
