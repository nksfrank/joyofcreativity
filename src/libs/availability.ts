import { describeBlank } from "@/libs/blank.utils";
import { resolveProductBlank } from "@/libs/product.utils";
import { assert } from "@/utils/assert";
import type {
  PatternVariant,
  ProductDefinition,
  ProductOrderItem,
} from "./product.types";

type RuleSuccess = { ok: true };
type RuleFailure = { ok: false; reason: string };
type RuleResult = RuleSuccess | RuleFailure;
type AvailabilityRule = (item: ProductOrderItem) => RuleResult;
type AvailabilityFn = (definition: ProductDefinition) => AvailabilityRule;

const blankInStock: AvailabilityFn = (definition) => (item) => {
  const blank = resolveProductBlank(definition, item.blankId);
  if (!blank) {
    return {
      ok: false,
      reason: `This product is not available in the selected color and size`,
    };
  }
  if (blank.stock <= 0) {
    return {
      ok: false,
      reason: `${describeBlank(blank)} is out of stock`,
    };
  }
  return { ok: true };
};

const patternVariant = (id: string) => (v: PatternVariant) =>
  v.pattern.id === id;

const patternCompatibleWithBlank: AvailabilityFn = (definition) => (item) => {
  const variant = definition.patternVariants.find(
    patternVariant(item.patternId),
  );
  assert(variant, `Pattern with id ${item.patternId} not found`);

  const blank = resolveProductBlank(definition, item.blankId);
  assert(blank, `Blank ${item.blankId} not found`);

  const compatible = variant.compatibleBlankIds.includes(blank.id);
  if (!compatible) {
    return {
      ok: false,
      reason: `Pattern ${variant.pattern.name} is not compatible with ${describeBlank(blank)}`,
    };
  }
  return { ok: true };
};

const yarnAvailable: AvailabilityFn = (definition) => (item) => {
  const reasons = item.yarnColorIds.flatMap((yarnColorId) => {
    const yarnColor = definition.availableYarnColours.find(
      (color) => color.id === yarnColorId,
    );
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

const patternYarnCountValid: AvailabilityFn = (definition) => (item) => {
  const variant = definition.patternVariants.find(
    patternVariant(item.patternId),
  );
  assert(variant, `Pattern with id ${item.patternId} not found`);

  if (item.yarnColorIds.length > variant.allowedYarnCount) {
    return {
      ok: false,
      reason: `Pattern ${variant.pattern.name} allows only ${variant.allowedYarnCount} yarn colors`,
    };
  }

  return { ok: true };
};

const customisationAllowed: AvailabilityFn = (definition) => (item) => {
  return item.customisation && !definition.customisation.allowText
    ? { ok: false, reason: `Customisation is not allowed for this product` }
    : { ok: true };
};
const customisationValid: AvailabilityFn = (definition) => (item) => {
  return item.customisation.length > definition.customisation.maxLength
    ? {
        ok: false,
        reason: `Customisation exceeds maximum length of ${definition.customisation.maxLength}`,
      }
    : { ok: true };
};

export class AvailabilityManager {
  private rules: AvailabilityRule[];

  constructor(definition: ProductDefinition) {
    this.rules = [
      blankInStock,
      patternCompatibleWithBlank,
      yarnAvailable,
      patternYarnCountValid,
      customisationAllowed,
      customisationValid,
    ].map((rule) => rule(definition));
  }

  check(item: ProductOrderItem): RuleFailure[] {
    return this.rules.map((rule) => rule(item)).filter((r) => !r.ok);
  }

  isAvailable(item: ProductOrderItem): boolean {
    return this.check(item).length === 0;
  }
}
