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

type ProductDetails = {
  name: string;
  description: string;
  slug: string;
  image: string;
};

export type ProductDefinition = {
  id: string;
  details: ProductDetails;

  price: Price;

  blanks: ProductBlank[];
  patternVariants: PatternVariant[];
  availableYarnColours: YarnColor[];
  customisation: CustomisationRule;
};

export type ProductOrderItem = {
  colorId: string;
  sizeId: string;
  patternId: string;
  yarnColorIds: string[];

  customisation: string;
};
