import type { Price, PriceModifier } from "./pricing";

//* Attributes */

/** A blank this product can be built from, plus the price impact of choosing it for this product. */
export type ProductBlank = {
  blankId: string;
  priceModifier: PriceModifier;
};

type Pattern = {
  id: string;
  name: string;
  description: string;

  priceModifier: PriceModifier;
};

type YarnColor = {
  id: string;
  name: string;
  available: boolean;

  priceModifier: PriceModifier;
};

type CustomisationRule = {
  allowText: boolean;
  maxLength: number;

  priceModifier: PriceModifier;
};

export type PatternVariant = {
  pattern: Pattern;
  compatibleBlankIds: string[];
  /**
   * The exact, required number of yarn colours this pattern takes (ADR-0009).
   * A valid ProductOrderItem has yarnColorIds.length === requiredYarnCount for
   * its chosen pattern; 0 is a plain knit with no yarn choice. Duplicates are
   * permitted and the list is an order-insignificant multiset.
   */
  requiredYarnCount: number;
};

/**
 * SEO / social metadata for a Product Detail page. Every field is optional: the
 * renderer falls back to the detail's own name/description/image when a field is
 * absent, so a curated entry only overrides what it wants to differ.
 */
export type SeoMeta = {
  /** <title> override; defaults to the detail name. */
  title?: string;
  /** meta description; defaults to the detail description. */
  description?: string;
  keywords?: string[];
  /** Open Graph title; defaults to seo.title ?? name. */
  ogTitle?: string;
  /** Open Graph description; defaults to seo.description ?? description. */
  ogDescription?: string;
  /** Open Graph image URL; defaults to the detail image. */
  ogImage?: string;
  /** Open Graph type; defaults to "product". */
  ogType?: string;
};

type ProductDetailTexts = {
  name: string;
  description: string;
  slug: string;
  image: string;
  seo: SeoMeta;
};

/** A product family: shared price, allowed blanks, and configuration options. */
export type ProductDefinition = {
  id: string;

  price: Price;

  blanks: ProductBlank[];
  patternVariants: PatternVariant[];
  availableYarnColours: YarnColor[];
  customisation: CustomisationRule;
};

/** One navigable page: a product family pinned to a single blank, with its own marketing texts. */
export type ProductDetail = {
  id: string;
  productId: string;
  blankId: string;
  /**
   * The locale this content is authored in. A single dimension today (all "sv");
   * localization (#45) filters entries by it without reshaping the collection.
   */
  locale: string;
  details: ProductDetailTexts;
};

export type ProductOrderItem = {
  blankId: string;
  patternId: string;
  yarnColorIds: string[];

  customisation: string;
};
