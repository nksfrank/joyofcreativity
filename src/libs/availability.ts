import type { StockSnapshot } from "@/libs/blank.types";
import { onHand } from "@/libs/blank.utils";
import { ProductCatalogue } from "@/libs/product-catalogue";
import type { ProductDefinition, ProductOrderItem } from "./product.types";

type RuleSuccess = { ok: true };
type RuleFailure = { ok: false; reason: string };
type RuleResult = RuleSuccess | RuleFailure;
type AvailabilityRule = (item: ProductOrderItem) => RuleResult;
type AvailabilityFn = (context: {
  products: ProductCatalogue;
  definition: ProductDefinition;
  stock: StockSnapshot;
}) => AvailabilityRule;

// Stock is an explicit input (#58): on-hand comes from the injected snapshot,
// never from the blank itself (which carries no count). A blank missing from
// the snapshot counts as zero.
const blankInStock: AvailabilityFn = ({ products, stock }) => {
  return (item) => {
    const blank = products.getOfferedBlank(item.blankId);
    if (!blank) {
      return {
        ok: false,
        reason: `This product is not available in the selected color and size`,
      };
    }
    if (onHand(stock, blank.id) <= 0) {
      return {
        ok: false,
        reason: `${products.describe(blank)} is out of stock`,
      };
    }
    return { ok: true };
  };
};

const patternCompatibleWithBlank: AvailabilityFn = ({ products }) => {
  return (item) => {
    const variant = products.requirePatternVariant(item.patternId);
    const blank = products.requireOfferedBlank(item.blankId);

    const compatible = variant.compatibleBlankIds.includes(blank.id);
    if (!compatible) {
      return {
        ok: false,
        reason: `Pattern ${variant.pattern.name} is not compatible with ${products.describe(blank)}`,
      };
    }
    return { ok: true };
  };
};

const yarnAvailable: AvailabilityFn = ({ products }) => {
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
const patternYarnCountValid: AvailabilityFn = ({ products }) => {
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
const customisationAllowed: AvailabilityFn =
  ({ definition }) =>
  (item) => {
    return item.customisation.length > 0 && !definition.customisation.allowText
      ? { ok: false, reason: `Customisation is not allowed for this product` }
      : { ok: true };
  };
// Length is only meaningful when text is allowed; gating on allowText keeps a
// text-forbidding product (maxLength 0) from emitting a bogus "max length 0" reason.
const customisationValid: AvailabilityFn =
  ({ definition }) =>
  (item) => {
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
    const context = {
      products: new ProductCatalogue(definition),
      definition,
      stock,
    };
    this.rules = [
      blankInStock,
      patternCompatibleWithBlank,
      yarnAvailable,
      patternYarnCountValid,
      customisationAllowed,
      customisationValid,
    ].map((rule) => rule(context));
  }

  check(item: ProductOrderItem): RuleFailure[] {
    return this.rules.map((rule) => rule(item)).filter((r) => !r.ok);
  }

  isAvailable(item: ProductOrderItem): boolean {
    return this.check(item).length === 0;
  }
}
