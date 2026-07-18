import { assert } from "@/utils/assert";
import type { Catalogue } from "./catalogue";
import type { ProductDefinition, ProductDetail } from "./product.types";

/**
 * The fixtures to check for dangling references (architecture-review candidate 3).
 * Passed in rather than imported so a test can wire a deliberately broken set and
 * the real check runs against the code-defined singletons. Blanks come from the
 * catalogue itself (`allBlanks()`) so they can't drift from what it resolves.
 */
export type FixtureIntegrityInput = {
  catalogue: Catalogue;
  products: readonly ProductDefinition[];
  details: readonly ProductDetail[];
};

/**
 * Every dangling colour/size/product/blank id across the fixture root, as a list of
 * human-readable problems (empty when the fixtures are sound). The data layer feeding
 * the engines otherwise fails *silently* — a bad `productId` yields `[]`, a missing
 * blank is filtered out — so this turns those quiet drops into a signal a caller can
 * reject on.
 */
export const checkFixtureIntegrity = ({
  catalogue,
  products,
  details,
}: FixtureIntegrityInput): string[] => {
  const problems: string[] = [];
  const knownProductIds = new Set(products.map((product) => product.id));

  for (const blank of catalogue.allBlanks()) {
    if (!catalogue.getColor(blank.colorId)) {
      problems.push(
        `Blank ${blank.id} references unknown colour ${blank.colorId}`,
      );
    }
    if (!catalogue.getSize(blank.sizeId)) {
      problems.push(
        `Blank ${blank.id} references unknown size ${blank.sizeId}`,
      );
    }
  }

  for (const product of products) {
    for (const productBlank of product.blanks) {
      if (!catalogue.getBlank(productBlank.blankId)) {
        problems.push(
          `Product ${product.id} offers unknown blank ${productBlank.blankId}`,
        );
      }
    }
    for (const variant of product.patternVariants) {
      for (const blankId of variant.compatibleBlankIds) {
        if (!catalogue.getBlank(blankId)) {
          problems.push(
            `Product ${product.id} pattern ${variant.pattern.id} lists unknown compatible blank ${blankId}`,
          );
        }
      }
    }
  }

  for (const detail of details) {
    if (!knownProductIds.has(detail.productId)) {
      problems.push(
        `Product Detail ${detail.id} references unknown product ${detail.productId}`,
      );
    }
    if (!catalogue.getBlank(detail.blankId)) {
      problems.push(
        `Product Detail ${detail.id} references unknown blank ${detail.blankId}`,
      );
    }
  }

  return problems;
};

/**
 * Throws one canonical error naming every dangling id when the fixtures are unsound.
 * Wired into static path generation (product-content.ts) so a broken fixture fails
 * the build loudly instead of dropping pages.
 */
export const assertFixtureIntegrity = (input: FixtureIntegrityInput): void => {
  const problems = checkFixtureIntegrity(input);
  assert(
    problems.length === 0,
    `Fixture integrity check failed:\n- ${problems.join("\n- ")}`,
  );
};
