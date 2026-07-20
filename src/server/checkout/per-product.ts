import { getProductById } from "@/libs/product";
import type { ProductDefinition } from "@/libs/product.types";

/**
 * Memoize a per-product resolver over a single cart pass. Both checkpoints build
 * something from a `ProductDefinition` and reuse it across the lines of one
 * family — `validateCheckout` its `{ catalogue, pricing }` engines, the commit
 * its display catalogue — so the shared scaffolding (resolve the definition once,
 * cache the `null` for an unknown product) lives here rather than being copied
 * per call site. `build` runs at most once per product id; an unknown product
 * caches as `null` and is never re-fetched.
 */
export const perProduct = <T>(
  build: (definition: ProductDefinition) => T,
): ((productId: string) => T | null) => {
  const cache = new Map<string, T | null>();
  return (productId) => {
    if (!cache.has(productId)) {
      const definition = getProductById(productId);
      cache.set(productId, definition ? build(definition) : null);
    }
    return cache.get(productId) ?? null;
  };
};
