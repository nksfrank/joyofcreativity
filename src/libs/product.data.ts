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
    patternVariants: [],
    availableYarnColours: [],
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
