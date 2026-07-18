import { AvailabilityManager } from "./availability";
import type { StockSnapshot } from "./blank.types";
import type { BlankOption } from "./blank.utils";
import type { Price } from "./money";
import { PricingManager } from "./pricing";
import type {
  CustomisationRule,
  PatternVariant,
  ProductDefinition,
  ProductOrderItem,
} from "./product.types";
import { ProductCatalogue } from "./product-catalogue";

export type OptionView = { id: string; label: string; disabled: boolean };

/** Human-readable labels for an order item's domain choices (ADR-0005). */
export type OrderItemLabels = {
  size: string;
  pattern: string;
  yarnColours: string[];
};

/**
 * The mutually-dependent trio that only exists once the selection resolves to a
 * complete, valid, in-stock order item. The three fields share one invariant, so
 * the interface hands them out together or not at all rather than as three
 * independently-nullable methods the caller must reason about in lockstep.
 */
export type ReadyConfiguration = {
  orderItem: ProductOrderItem;
  price: Price;
  labels: OrderItemLabels;
};

/**
 * The single projection the island renders from (ADR-0005): every field list,
 * the customisation rule, the dead-end signal, and — behind one nullable `ready`
 * — the priceable order item. The island talks to this record alone and never
 * reads the {@link ProductDefinition} directly.
 */
export type ConfigurationView = {
  sizeOptions: OptionView[];
  patternOptions: OptionView[];
  yarnFields: YarnField[];
  customisationRule: CustomisationRule;
  deadEnd: DeadEnd | null;
  ready: ReadyConfiguration | null;
};

/** A downstream selection to clear when the current one strands the customer. */
export type DeadEnd = { reset: keyof Selection; reason: string };

/**
 * One required yarn slot for the chosen pattern (ADR-0009). Every field offers
 * the same list of available yarn colours; `selectedId` is the field's resolved
 * value — the customer's explicit pick, or the sole available colour when there
 * is only one (a single-alternative field auto-resolves).
 */
export type YarnField = {
  index: number;
  options: OptionView[];
  selectedId: string | undefined;
};
export type Selection = {
  sizeId?: string;
  patternId?: string;
  yarnColorIds: string[];
  customisation: string;
};

/** Every blank the given colour is offered in, across all sizes (stock included). */
function resolveBlanksForColour(
  definition: ProductDefinition,
  colorId: string,
): BlankOption[] {
  return new ProductCatalogue(definition)
    .blankOptions()
    .filter((option) => option.color.id === colorId);
}

/**
 * The sole size this colour is offered in, or undefined when the family
 * structurally offers more than one — regardless of stock, so a size that is
 * merely out of stock never collapses a real choice into an auto-select.
 */
function soleStructuralSize(
  definition: ProductDefinition,
  colorId: string,
): string | undefined {
  const sizeIds = new Set(
    resolveBlanksForColour(definition, colorId).map((option) => option.size.id),
  );
  return sizeIds.size === 1 ? [...sizeIds].at(0) : undefined;
}

/** The sole pattern the family offers, or undefined when it offers more than one. */
function soleStructuralPattern(
  definition: ProductDefinition,
): string | undefined {
  return definition.patternVariants.length === 1
    ? definition.patternVariants.at(0)?.pattern.id
    : undefined;
}

/**
 * Drives the configurator: given a product family and the (route-fixed) colour,
 * reports which options are selectable. An option is enabled iff at least one
 * complete, valid, in-stock order item still exists that includes it.
 * See docs/adr/0005-configuration-model.md.
 */
export class ConfigurationModel {
  private readonly availability: AvailabilityManager;
  private readonly pricing: PricingManager;
  private readonly products: ProductCatalogue;
  private readonly selection: Selection;

  constructor(
    private readonly definition: ProductDefinition,
    private readonly colorId: string,
    private readonly stock: StockSnapshot,
    selection: Partial<Selection> = {},
  ) {
    this.availability = new AvailabilityManager(definition, stock);
    this.pricing = new PricingManager(definition);
    this.products = new ProductCatalogue(definition);
    this.selection = {
      yarnColorIds: [],
      customisation: "",
      ...selection,
    };
  }

  /**
   * The initial selection the configurator opens with: every *structurally
   * single* required attribute (the family defines exactly one option) is
   * pre-filled, so a fully single-option product prices immediately on load
   * (ADR-0010). The trigger is the structural option count alone — never "one
   * option left enabled after feasibility disabled the rest", so a real choice
   * is never auto-decided. Yarn needs no entry here: a single-available yarn
   * field auto-resolves in {@link yarnFields}. The island seeds its state from
   * this once and never re-derives defaults itself (ADR-0005).
   */
  static defaultSelection(
    definition: ProductDefinition,
    colorId: string,
  ): Selection {
    return {
      sizeId: soleStructuralSize(definition, colorId),
      patternId: soleStructuralPattern(definition),
      yarnColorIds: [],
      customisation: "",
    };
  }

  /**
   * The single projection the island renders from (ADR-0005). Collapses the
   * field lists, customisation rule, dead-end signal, and the priceable trio
   * into one record so the island crosses one seam, and the completeness
   * invariant shared by orderItem/price/labels is encoded once as `ready`.
   */
  view(): ConfigurationView {
    return {
      sizeOptions: this.sizeOptions(),
      patternOptions: this.patternOptions(),
      yarnFields: this.yarnFields(),
      customisationRule: this.definition.customisation,
      deadEnd: this.deadEnd(),
      ready: this.ready(),
    };
  }

  private sizeOptions(): OptionView[] {
    return this.blanksForColour().map((option) => ({
      id: option.size.id,
      label: option.size.name,
      disabled: (this.stock.get(option.blankId) ?? 0) <= 0,
    }));
  }

  private patternOptions(): OptionView[] {
    return this.definition.patternVariants.map((variant) => ({
      id: variant.pattern.id,
      label: variant.pattern.name,
      disabled: !this.hasCompletion({ patternId: variant.pattern.id }),
    }));
  }

  /**
   * One option-list per required yarn slot for the chosen pattern (ADR-0009).
   * Returns no fields when no pattern is selected (the count is unknown) or the
   * pattern is a plain knit (`requiredYarnCount: 0`). Each field offers every
   * available yarn colour; a field with a single available colour auto-resolves
   * to it. Duplicates across fields are allowed and order is insignificant.
   */
  private yarnFields(): YarnField[] {
    const variant = this.selectedVariant();
    if (variant === undefined) {
      return [];
    }
    const available = this.availableYarns();
    const options: OptionView[] = available.map((yarn) => ({
      id: yarn.id,
      label: yarn.name,
      disabled: false,
    }));
    const soleId = available.length === 1 ? available.at(0)?.id : undefined;
    return Array.from({ length: variant.requiredYarnCount }, (_, index) => ({
      index,
      options,
      selectedId: this.selection.yarnColorIds.at(index) ?? soleId,
    }));
  }

  /**
   * The priceable trio, or null when the current selection is not yet a complete,
   * valid, in-stock order item. Order item, price, and labels share one invariant
   * (ADR-0005), so they resolve together here rather than as three methods a
   * caller has to null-check in lockstep. Colour and product name stay with the
   * island; every domain-resolved label is computed here so the island never
   * reads the ProductDefinition directly.
   */
  private ready(): ReadyConfiguration | null {
    const orderItem = this.currentItem();
    if (orderItem === null || !this.availability.isAvailable(orderItem)) {
      return null;
    }
    return {
      orderItem,
      price: this.pricing.calculate(orderItem),
      labels: this.labelsFor(orderItem),
    };
  }

  private labelsFor(item: ProductOrderItem): OrderItemLabels {
    const size =
      this.blanksForColour().find((option) => option.blankId === item.blankId)
        ?.size.name ?? "";
    const pattern = this.findVariant(item.patternId)?.pattern.name ?? "";
    const yarnColours = item.yarnColorIds.map(
      (id) => this.products.getYarnColor(id)?.name ?? "",
    );
    return { size, pattern, yarnColours };
  }

  /**
   * When the current selection cannot lead to any valid, in-stock item, name the
   * downstream selection to clear so the customer is freed rather than stuck.
   */
  private deadEnd(): DeadEnd | null {
    // Dead-ends are about colour/size/pattern; yarn is left free so the search
    // completes it (omitting yarnColorIds lets hasCompletion fill the required
    // count). A pattern needing yarn with none available is already disabled.
    const { sizeId, patternId, customisation } = this.selection;
    const base: Partial<Selection> = { sizeId, patternId, customisation };
    if (this.hasCompletion(base)) {
      return null;
    }
    if (
      patternId !== undefined &&
      this.hasCompletion({ ...base, patternId: undefined })
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
   * to a blank, a pattern is chosen, and every required yarn field is filled.
   * Not yet validated — see orderItem().
   */
  private currentItem(): ProductOrderItem | null {
    const { sizeId, patternId, customisation } = this.selection;
    if (sizeId === undefined || patternId === undefined) {
      return null;
    }
    const blankId = this.blanksForColour().find(
      (option) => option.size.id === sizeId,
    )?.blankId;
    if (blankId === undefined) {
      return null;
    }
    const yarnColorIds = this.resolvedYarnIds();
    if (yarnColorIds === null) {
      return null;
    }
    return { blankId, patternId, yarnColorIds, customisation };
  }

  private findVariant(patternId: string): PatternVariant | undefined {
    return this.products.getPatternVariant(patternId);
  }

  private selectedVariant(): PatternVariant | undefined {
    return this.selection.patternId === undefined
      ? undefined
      : this.findVariant(this.selection.patternId);
  }

  private availableYarns() {
    return this.definition.availableYarnColours.filter(
      (yarn) => yarn.available,
    );
  }

  /** Every blank this colour is offered in, across all sizes (stock included). */
  private blanksForColour() {
    return resolveBlanksForColour(this.definition, this.colorId);
  }

  /**
   * The resolved yarn colour of every required field, in field order, or null if
   * any required field is still unfilled (so the item is incomplete).
   */
  private resolvedYarnIds(): string[] | null {
    const ids: string[] = [];
    for (const field of this.yarnFields()) {
      if (field.selectedId === undefined) {
        return null;
      }
      ids.push(field.selectedId);
    }
    return ids;
  }

  /**
   * Full-completion feasibility: is there any valid, in-stock order item that
   * includes the given partial selection? Brute-forces the (tiny) blank × pattern
   * space. Unless the caller fixes the yarns, each pattern is completed with its
   * exact required count filled from the available yarns (repetition allowed, so
   * a single available colour suffices for any N — ADR-0009); a pattern that
   * needs yarn but has none available has no completion and is infeasible.
   */
  private hasCompletion(selection: Partial<Selection>): boolean {
    const blankIds = this.blanksForColour()
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
        const yarnColorIds = this.completionYarns(patternId, selection);
        if (yarnColorIds === null) {
          continue;
        }
        const item: ProductOrderItem = {
          blankId,
          patternId,
          yarnColorIds,
          customisation: selection.customisation ?? "",
        };
        if (this.availability.isAvailable(item)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * The yarn ids to try when completing the given pattern. Honours the caller's
   * fixed yarns when set; otherwise fills the pattern's exact required count from
   * the available yarns, returning null when the pattern needs yarn but none is
   * available (no completion exists).
   */
  private completionYarns(
    patternId: string,
    selection: Partial<Selection>,
  ): string[] | null {
    if (selection.yarnColorIds !== undefined) {
      return selection.yarnColorIds;
    }
    const required = this.findVariant(patternId)?.requiredYarnCount ?? 0;
    if (required === 0) {
      return [];
    }
    const yarn = this.availableYarns().at(0);
    if (yarn === undefined) {
      return null;
    }
    return Array.from({ length: required }, () => yarn.id);
  }
}
