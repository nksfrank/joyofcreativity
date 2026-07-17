import type { StockSnapshot } from "@/libs/blank.types";
import { catalogue } from "@/libs/catalogue";
import { ProductCatalogue } from "@/libs/product-catalogue";
import type { ProductDefinition, ProductOrderItem } from "./product.types";

type RuleSuccess = { ok: true };
type RuleFailure = { ok: false; reason: string };
type RuleResult = RuleSuccess | RuleFailure;
type AvailabilityRule = (item: ProductOrderItem) => RuleResult;
type AvailabilityFn = (
  definition: ProductDefinition,
  stock: StockSnapshot,
) => AvailabilityRule;

// Stock is an explicit input (#58): on-hand comes from the injected snapshot,
// never from `blank.stock`. A blank missing from the snapshot counts as zero.
const blankInStock: AvailabilityFn = (definition, stock) => {
  const products = new ProductCatalogue(definition);
  return (item) => {
    const blank = products.getOfferedBlank(item.blankId);
    if (!blank) {
      return {
        ok: false,
        reason: `This product is not available in the selected color and size`,
      };
    }
    if ((stock.get(blank.id) ?? 0) <= 0) {
      return {
        ok: false,
        reason: `${catalogue.describe(blank)} is out of stock`,
      };
    }
    return { ok: true };
  };
};

const patternCompatibleWithBlank: AvailabilityFn = (definition) => {
  const products = new ProductCatalogue(definition);
  return (item) => {
    const variant = products.requirePatternVariant(item.patternId);
    const blank = products.requireOfferedBlank(item.blankId);

    const compatible = variant.compatibleBlankIds.includes(blank.id);
    if (!compatible) {
      return {
        ok: false,
        reason: `Pattern ${variant.pattern.name} is not compatible with ${catalogue.describe(blank)}`,
      };
    }
    return { ok: true };
  };
};

const yarnAvailable: AvailabilityFn = (definition) => {
  const products = new ProductCatalogue(definition);
  return (item) => {
    const reasons = item.yarnColorIds.flatMap((yarnColorId) => {
      const yarnColor = products.getYarnColor(yarnColorId);
      if (!yarnColor) {
        return [`Yarn color with id ${yarnColorId} not found`];
      }
      if (!yarnColor.available) {
        return [`Yarn color ${yarnColor.name} is not available`];
      }
      return [];
    });
    if (reasons.length > 0) {
      return { ok: false, reason: reasons.join(", ") };
    }
    return { ok: true };
  };
};

// A pattern takes an exact, required number of yarn colours (ADR-0009): the item
// must carry precisely that many, no fewer and no more. Duplicates count towards
// the total; each entry is separately checked by yarnAvailable.
const patternYarnCountValid: AvailabilityFn = (definition) => {
  const products = new ProductCatalogue(definition);
  return (item) => {
    const variant = products.requirePatternVariant(item.patternId);

    if (item.yarnColorIds.length !== variant.requiredYarnCount) {
      return {
        ok: false,
        reason: `Pattern ${variant.pattern.name} requires exactly ${variant.requiredYarnCount} yarn colors`,
      };
    }

    return { ok: true };
  };
};

// Fires only for a text-forbidding product that was nevertheless given text, so a
// forbidden product emits this single reason rather than also tripping the length rule.
const customisationAllowed: AvailabilityFn = (definition) => (item) => {
  return item.customisation.length > 0 && !definition.customisation.allowText
    ? { ok: false, reason: `Customisation is not allowed for this product` }
    : { ok: true };
};
// Length is only meaningful when text is allowed; gating on allowText keeps a
// text-forbidding product (maxLength 0) from emitting a bogus "max length 0" reason.
const customisationValid: AvailabilityFn = (definition) => (item) => {
  return definition.customisation.allowText &&
    item.customisation.length > definition.customisation.maxLength
    ? {
        ok: false,
        reason: `Customisation exceeds maximum length of ${definition.customisation.maxLength}`,
      }
    : { ok: true };
};

export class AvailabilityManager {
  private rules: AvailabilityRule[];

  constructor(definition: ProductDefinition, stock: StockSnapshot) {
    this.rules = [
      blankInStock,
      patternCompatibleWithBlank,
      yarnAvailable,
      patternYarnCountValid,
      customisationAllowed,
      customisationValid,
    ].map((rule) => rule(definition, stock));
  }

  check(item: ProductOrderItem): RuleFailure[] {
    return this.rules.map((rule) => rule(item)).filter((r) => !r.ok);
  }

  isAvailable(item: ProductOrderItem): boolean {
    return this.check(item).length === 0;
  }
}
