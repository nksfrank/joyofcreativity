import { AvailabilityManager } from "./availability";
import { resolveBlankOptionsByProduct } from "./blank.utils";
import { type Price, PricingManager } from "./pricing";
import type { ProductDefinition, ProductOrderItem } from "./product.types";

export type OptionView = { id: string; label: string; disabled: boolean };
export type Selection = {
  sizeId?: string;
  patternId?: string;
  yarnColorIds: string[];
  customisation: string;
};

/**
 * Drives the configurator: given a product family and the (route-fixed) colour,
 * reports which options are selectable. An option is enabled iff at least one
 * complete, valid, in-stock order item still exists that includes it.
 * See docs/adr/0005-configuration-model.md.
 */
export class ConfigurationModel {
  private readonly availability: AvailabilityManager;
  private readonly pricing: PricingManager;
  private readonly selection: Selection;

  constructor(
    private readonly definition: ProductDefinition,
    private readonly colorId: string,
    selection: Partial<Selection> = {},
  ) {
    this.availability = new AvailabilityManager(definition);
    this.pricing = new PricingManager(definition);
    this.selection = {
      yarnColorIds: [],
      customisation: "",
      ...selection,
    };
  }

  select(partial: Partial<Selection>): ConfigurationModel {
    return new ConfigurationModel(this.definition, this.colorId, {
      ...this.selection,
      ...partial,
    });
  }

  sizeOptions(): OptionView[] {
    return resolveBlankOptionsByProduct(this.definition)
      .filter((option) => option.color.id === this.colorId)
      .map((option) => ({
        id: option.size.id,
        label: option.size.name,
        disabled: option.stock <= 0,
      }));
  }

  patternOptions(): OptionView[] {
    return this.definition.patternVariants.map((variant) => ({
      id: variant.pattern.id,
      label: variant.pattern.name,
      disabled: !this.hasCompletion({ patternId: variant.pattern.id }),
    }));
  }

  yarnOptions(): OptionView[] {
    return this.definition.availableYarnColours.map((yarn) => {
      // An already-selected yarn is probed with the current set (so it stays
      // enabled and de-selectable); an unselected one is probed with it added,
      // so a choice that would exceed the pattern's allowedYarnCount disables.
      const selected = this.selection.yarnColorIds.includes(yarn.id);
      const probe = selected
        ? this.selection.yarnColorIds
        : [...this.selection.yarnColorIds, yarn.id];
      return {
        id: yarn.id,
        label: yarn.name,
        disabled: !this.hasCompletion({
          sizeId: this.selection.sizeId,
          patternId: this.selection.patternId,
          yarnColorIds: probe,
        }),
      };
    });
  }

  price(): Price | null {
    const item = this.currentItem();
    return item ? this.pricing.calculate(item) : null;
  }

  orderItem(): ProductOrderItem | null {
    const item = this.currentItem();
    return item && this.availability.isAvailable(item) ? item : null;
  }

  /**
   * When the current selection cannot lead to any valid, in-stock item, name the
   * downstream selection to clear so the customer is freed rather than stuck.
   */
  deadEnd(): { reset: keyof Selection; reason: string } | null {
    if (this.hasCompletion(this.selection)) {
      return null;
    }
    if (
      this.selection.patternId !== undefined &&
      this.hasCompletion({ ...this.selection, patternId: undefined })
    ) {
      return {
        reset: "patternId",
        reason:
          "This pattern is not available in any in-stock size for this colour.",
      };
    }
    return {
      reset: "sizeId",
      reason: "This colour has no available combination in stock.",
    };
  }

  /**
   * The order item described by the current selection, once colour+size resolve
   * to a blank and a pattern is chosen. Not yet validated — see orderItem().
   */
  private currentItem(): ProductOrderItem | null {
    const { sizeId, patternId, yarnColorIds, customisation } = this.selection;
    if (sizeId === undefined || patternId === undefined) {
      return null;
    }
    const blankId = resolveBlankOptionsByProduct(this.definition).find(
      (option) => option.color.id === this.colorId && option.size.id === sizeId,
    )?.blankId;
    if (blankId === undefined) {
      return null;
    }
    return { blankId, patternId, yarnColorIds, customisation };
  }

  /**
   * Full-completion feasibility: is there any valid, in-stock order item that
   * includes the given partial selection? Brute-forces the (tiny) blank × pattern
   * space, using the trivial yarn/customisation completion unless the caller fixes them.
   */
  private hasCompletion(selection: Partial<Selection>): boolean {
    const blankIds = resolveBlankOptionsByProduct(this.definition)
      .filter((option) => option.color.id === this.colorId)
      .filter(
        (option) =>
          selection.sizeId === undefined || option.size.id === selection.sizeId,
      )
      .map((option) => option.blankId);

    const patternIds =
      selection.patternId !== undefined
        ? [selection.patternId]
        : this.definition.patternVariants.map((variant) => variant.pattern.id);

    for (const blankId of blankIds) {
      for (const patternId of patternIds) {
        const item: ProductOrderItem = {
          blankId,
          patternId,
          yarnColorIds: selection.yarnColorIds ?? [],
          customisation: selection.customisation ?? "",
        };
        if (this.availability.isAvailable(item)) {
          return true;
        }
      }
    }
    return false;
  }
}
