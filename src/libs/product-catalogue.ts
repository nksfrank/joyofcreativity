import { assert } from "@/utils/assert";
import type { Blank } from "./blank.types";
import type { BlankOption } from "./blank.utils";
import { type Catalogue, catalogue as globalCatalogue } from "./catalogue";
import type {
  PatternVariant,
  ProductBlank,
  ProductDefinition,
  ProductOrderItem,
  YarnColor,
} from "./product.types";

/**
 * Deep resolver scoped to a single `ProductDefinition`, mirroring how
 * `PricingManager`/`AvailabilityManager` are built from a definition. Owns the
 * per-product by-id lookups (pattern variant, yarn colour) and the "offered by
 * this definition" blank check, composing the global {@link Catalogue} for the
 * actual blank fetch and colour/size joins. Tolerant `get<Thing>` is paired with
 * a strict `require<Thing>` that throws one canonical `"<Thing> <id> not found"`.
 */
export class ProductCatalogue {
  readonly #definition: ProductDefinition;
  readonly #catalogue: Catalogue;
  readonly #offered: ReadonlyMap<string, ProductBlank>;
  readonly #patternVariants: ReadonlyMap<string, PatternVariant>;
  readonly #yarnColors: ReadonlyMap<string, YarnColor>;

  constructor(
    definition: ProductDefinition,
    catalogue: Catalogue = globalCatalogue,
  ) {
    this.#definition = definition;
    this.#catalogue = catalogue;
    this.#offered = new Map(
      definition.blanks.map((blank) => [blank.blankId, blank]),
    );
    this.#patternVariants = new Map(
      definition.patternVariants.map((variant) => [
        variant.pattern.id,
        variant,
      ]),
    );
    this.#yarnColors = new Map(
      definition.availableYarnColours.map((yarn) => [yarn.id, yarn]),
    );
  }

  getPatternVariant(id: string): PatternVariant | undefined {
    return this.#patternVariants.get(id);
  }

  requirePatternVariant(id: string): PatternVariant {
    const variant = this.getPatternVariant(id);
    assert(variant, `Pattern variant ${id} not found`);
    return variant;
  }

  getYarnColor(id: string): YarnColor | undefined {
    return this.#yarnColors.get(id);
  }

  requireYarnColor(id: string): YarnColor {
    const yarn = this.getYarnColor(id);
    assert(yarn, `Yarn color ${id} not found`);
    return yarn;
  }

  /** Resolves a blank only if this definition offers it (else undefined). */
  getOfferedBlank(id: string): Blank | undefined {
    return this.#offered.has(id) ? this.#catalogue.getBlank(id) : undefined;
  }

  /** The offered blank, or throws the canonical not-found message. */
  requireOfferedBlank(id: string): Blank {
    const blank = this.getOfferedBlank(id);
    assert(blank, `Blank ${id} not found`);
    return blank;
  }

  /** The offer record (blank id + price modifier) if this definition offers it. */
  getProductBlank(id: string): ProductBlank | undefined {
    return this.#offered.get(id);
  }

  /** The offer record, or throws the canonical not-found message. */
  requireProductBlank(id: string): ProductBlank {
    const productBlank = this.getProductBlank(id);
    assert(productBlank, `Blank ${id} not found`);
    return productBlank;
  }

  /** Human-readable label for a blank, via the composed catalogue. */
  describe(blank: Blank): string {
    return this.#catalogue.describe(blank);
  }

  /**
   * Human-readable descriptor for a configured selection, e.g. "Ivory Small —
   * Plain". Tolerant: an unoffered blank falls back to its id and an unknown
   * pattern is dropped, so a display lookup never fails on a cosmetic miss.
   */
  describeSelection(item: ProductOrderItem): string {
    const blank = this.getOfferedBlank(item.blankId);
    const variant = this.getPatternVariant(item.patternId);
    return [blank ? this.describe(blank) : item.blankId, variant?.pattern.name]
      .filter(Boolean)
      .join(" — ");
  }

  /** Every colour x size this product offers, joined for display. */
  blankOptions(): BlankOption[] {
    return this.#definition.blanks
      .map((productBlank) =>
        this.#catalogue.getBlankOption(productBlank.blankId),
      )
      .filter((option): option is BlankOption => option !== undefined);
  }
}
