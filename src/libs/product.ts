import type { ProductDefinition, ProductDetail } from "./product.types";

const products: ProductDefinition[] = [
  {
    id: "1",
    price: { amount: 79900, currency: "SEK" },
    blanks: [
      { blankId: "blank1", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank2", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank3", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank4", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank5", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank6", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank7", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank8", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank9", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank10", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank11", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank12", priceModifier: { value: 0, type: "fixed" } },
    ],
    patternVariants: [
      {
        pattern: {
          id: "plain",
          name: "Plain",
          description: "A clean knit with no lettering.",
          priceModifier: { value: 0, type: "fixed" },
        },
        // Compatible with every offered blank (cream/red/blue/green × S/M/L).
        compatibleBlankIds: [
          "blank1",
          "blank2",
          "blank3",
          "blank4",
          "blank5",
          "blank6",
          "blank7",
          "blank8",
          "blank9",
          "blank10",
          "blank11",
          "blank12",
        ],
        requiredYarnCount: 1,
      },
      {
        pattern: {
          id: "signature",
          name: "Signature Letter",
          description: "The signature knit letter motif.",
          priceModifier: { value: 10000, type: "fixed" },
        },
        compatibleBlankIds: [
          "blank1",
          "blank2",
          "blank3",
          "blank4",
          "blank5",
          "blank6",
          "blank7",
          "blank8",
          "blank9",
          "blank10",
          "blank11",
          "blank12",
        ],
        requiredYarnCount: 3,
      },
    ],
    availableYarnColours: [
      {
        id: "ivory",
        name: "Ivory",
        available: true,
        priceModifier: { value: 2000, type: "fixed" },
      },
      {
        id: "charcoal",
        name: "Charcoal",
        available: true,
        priceModifier: { value: 2000, type: "fixed" },
      },
      {
        id: "rose",
        name: "Rose",
        available: true,
        priceModifier: { value: 2000, type: "fixed" },
      },
      {
        id: "sky",
        name: "Sky",
        available: true,
        priceModifier: { value: 2000, type: "fixed" },
      },
      // Discontinued thread — offered but unavailable, so the configurator disables it.
      {
        id: "moss",
        name: "Moss",
        available: false,
        priceModifier: { value: 2000, type: "fixed" },
      },
    ],
    customisation: {
      allowText: true,
      maxLength: 12,
      priceModifier: { value: 4900, type: "fixed" },
    },
  },
  // A family offered in a single colour (white, blank19-21 across S/M/L). Its product
  // page renders no colour switcher — there is nowhere to switch to (ADR-0011).
  {
    id: "2",
    price: { amount: 69900, currency: "SEK" },
    blanks: [
      { blankId: "blank19", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank20", priceModifier: { value: 0, type: "fixed" } },
      { blankId: "blank21", priceModifier: { value: 0, type: "fixed" } },
    ],
    patternVariants: [
      {
        pattern: {
          id: "plain",
          name: "Plain",
          description: "A clean knit with no lettering.",
          priceModifier: { value: 0, type: "fixed" },
        },
        compatibleBlankIds: ["blank19", "blank20", "blank21"],
        requiredYarnCount: 1,
      },
      {
        pattern: {
          id: "signature",
          name: "Signature Letter",
          description: "The signature knit letter motif.",
          priceModifier: { value: 10000, type: "fixed" },
        },
        compatibleBlankIds: ["blank19", "blank20", "blank21"],
        requiredYarnCount: 3,
      },
    ],
    availableYarnColours: [
      {
        id: "ivory",
        name: "Ivory",
        available: true,
        priceModifier: { value: 2000, type: "fixed" },
      },
      {
        id: "charcoal",
        name: "Charcoal",
        available: true,
        priceModifier: { value: 2000, type: "fixed" },
      },
      {
        id: "rose",
        name: "Rose",
        available: true,
        priceModifier: { value: 2000, type: "fixed" },
      },
    ],
    customisation: {
      allowText: true,
      maxLength: 12,
      priceModifier: { value: 4900, type: "fixed" },
    },
  },
  // A fully single-option family: one colour (black), one size (medium, blank17),
  // one pattern, and a single available yarn colour. Every required attribute is
  // structurally single, so the configurator opens priced and add-to-cart-ready
  // with nothing to pick (ADR-0010 / nksfrank/joyofcreativity#12).
  {
    id: "3",
    price: { amount: 89900, currency: "SEK" },
    blanks: [
      { blankId: "blank17", priceModifier: { value: 0, type: "fixed" } },
    ],
    patternVariants: [
      {
        pattern: {
          id: "plain",
          name: "Plain",
          description: "A clean knit with no lettering.",
          priceModifier: { value: 0, type: "fixed" },
        },
        compatibleBlankIds: ["blank17"],
        requiredYarnCount: 1,
      },
    ],
    availableYarnColours: [
      {
        id: "charcoal",
        name: "Charcoal",
        available: true,
        priceModifier: { value: 2000, type: "fixed" },
      },
    ],
    customisation: {
      allowText: false,
      maxLength: 0,
      priceModifier: { value: 0, type: "fixed" },
    },
  },
];

const productDetails: ProductDetail[] = [
  {
    id: "1",
    productId: "1",
    blankId: "blank1",
    details: {
      name: "Signature Letter Sweater",
      description: "A cozy hand-knit sweater, customisable to your taste.",
      slug: "signature-letter-sweater",
      image: "/images/signature-letter-sweater.jpg",
    },
  },
  {
    id: "2",
    productId: "1",
    blankId: "blank4",
    details: {
      name: "Christmas Red Signature Letter Sweater",
      description:
        "Our signature hand-knit sweater in a festive red, ready for the holidays.",
      slug: "christmas-red-signature-letter-sweater",
      image: "/images/christmas-red-signature-letter-sweater.jpg",
    },
  },
  {
    id: "3",
    productId: "2",
    blankId: "blank19",
    details: {
      name: "Snowdrift Sweater",
      description: "A hand-knit sweater in a single, crisp white.",
      slug: "snowdrift-sweater",
      image: "/images/snowdrift-sweater.jpg",
    },
  },
  {
    id: "4",
    productId: "3",
    blankId: "blank17",
    details: {
      name: "Midnight Sweater",
      description:
        "A single-size hand-knit in midnight black — one colour, one pattern, ready to buy in one tap.",
      slug: "midnight-sweater",
      image: "/images/midnight-sweater.jpg",
    },
  },
];

export const getProductById = (id: string): ProductDefinition | undefined =>
  products.find((product) => product.id === id);

export const getAllProducts = (): ProductDefinition[] => products;

export const getProductDetailById = (id: string): ProductDetail | undefined =>
  productDetails.find((detail) => detail.id === id);

export const getProductDetailsByProductId = (
  productId: string,
): ProductDetail[] =>
  productDetails.filter((detail) => detail.productId === productId);

export const getAllProductDetails = (): ProductDetail[] => productDetails;
