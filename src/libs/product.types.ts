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
  allowedYarnCount: number;
};

type ProductDetailTexts = {
  name: string;
  description: string;
  slug: string;
  image: string;
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
  details: ProductDetailTexts;
};

export type ProductOrderItem = {
  blankId: string;
  patternId: string;
  yarnColorIds: string[];

  customisation: string;
};
