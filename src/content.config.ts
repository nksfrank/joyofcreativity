import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
// zod is bundled by Astro and re-exported here (ADR-0014: no direct zod dep);
// `astro/zod` is the non-deprecated import path for it.
import { z } from "astro/zod";

/**
 * SEO / social overrides. Every field is optional; the renderer (resolveSeoMeta)
 * falls back to the entry's own name/description/image, so an entry only authors
 * what it wants to differ.
 */
const seo = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    ogImage: z.string().optional(),
    ogType: z.string().optional(),
  })
  .default({});

/**
 * Per-product marketing content + SEO — one git-authored file per Product Detail
 * (issue #59). The structural/pricing model (ProductDefinition, blanks) stays
 * code-defined in src/libs/ for the isomorphic engines; this collection holds only
 * copy and metadata. The entry `id` (the filename, e.g. "1") is the ProductDetail
 * id, so routes stay `/product/{id}/{slug}` unchanged (ADR-0006).
 *
 * `locale` is a single dimension today (all "sv"); localization (#45) filters
 * entries by it — a new dimension, not a reshape of these fields.
 */
const products = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/products",
    // The entry id is the ProductDetail id (the filename, e.g. "1"), so routes
    // stay `/product/{id}/{slug}` unchanged. Without this, the glob loader would
    // treat the frontmatter `slug` as the id and rewrite every URL.
    generateId: ({ entry }) => entry.replace(/\.[^.]+$/, ""),
  }),
  schema: z.object({
    /** The product family (ProductDefinition.id) this page sells. */
    productId: z.string(),
    /** The single blank this page is pinned to; its colour is the page default. */
    blankId: z.string(),
    name: z.string(),
    slug: z.string(),
    image: z.string(),
    /** Short lede / meta description; the body carries the extended copy. */
    description: z.string(),
    locale: z.string().default("sv"),
    seo,
  }),
});

export const collections = { products };
