import { assert } from "@/utils/assert";
import { blanks, colors, sizes } from "./blank";
import type { Blank, Color, Size } from "./blank.types";
import type { BlankOption } from "./blank.utils";

/**
 * The code-defined structural catalogue the isomorphic (sync) engines resolve
 * against: colours, sizes, and the blanks (colour x size) built from them.
 * Injected, never created here, so tests can wire a tiny fixture and the real
 * source can later be swapped in one place (structural data stays code-defined
 * per #59 — no async needed).
 */
export type CatalogueData = {
  colors: readonly Color[];
  sizes: readonly Size[];
  blanks: readonly Blank[];
};

/**
 * Deep resolver over the blank catalogue. Pairs a tolerant `get<Thing>` with a
 * strict `require<Thing>` (one canonical `"<Thing> <id> not found"` message via
 * the shared assert), and owns the blank -> (colour, size) join so those reads
 * live behind one small interface instead of raw `.find`-by-id at each call site.
 */
export class Catalogue {
  readonly #colors: ReadonlyMap<string, Color>;
  readonly #sizes: ReadonlyMap<string, Size>;
  readonly #blanks: ReadonlyMap<string, Blank>;

  constructor({ colors, sizes, blanks }: CatalogueData) {
    this.#colors = new Map(colors.map((color) => [color.id, color]));
    this.#sizes = new Map(sizes.map((size) => [size.id, size]));
    this.#blanks = new Map(blanks.map((blank) => [blank.id, blank]));
  }

  getColor(id: string): Color | undefined {
    return this.#colors.get(id);
  }

  requireColor(id: string): Color {
    const color = this.getColor(id);
    assert(color, `Color ${id} not found`);
    return color;
  }

  getSize(id: string): Size | undefined {
    return this.#sizes.get(id);
  }

  requireSize(id: string): Size {
    const size = this.getSize(id);
    assert(size, `Size ${id} not found`);
    return size;
  }

  getBlank(id: string): Blank | undefined {
    return this.#blanks.get(id);
  }

  requireBlank(id: string): Blank {
    const blank = this.getBlank(id);
    assert(blank, `Blank ${id} not found`);
    return blank;
  }

  /** The blank joined with its colour and size — strict on every part. */
  blankOption(id: string): BlankOption {
    const blank = this.requireBlank(id);
    return {
      blankId: blank.id,
      color: this.requireColor(blank.colorId),
      size: this.requireSize(blank.sizeId),
    };
  }

  /**
   * Human-readable label for a blank, e.g. "Cream Small". Tolerant of missing
   * parts (an unknown colour or size is simply omitted from the label).
   */
  describe(blank: Blank): string {
    const color = this.getColor(blank.colorId);
    const size = this.getSize(blank.sizeId);
    return [color?.name, size?.name].filter(Boolean).join(" ");
  }
}

/** The ready-wired singleton over the code-defined catalogue, for real callers. */
export const catalogue = new Catalogue({ colors, sizes, blanks });
