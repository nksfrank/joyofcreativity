import type { ProductDefinition } from "./product.types";

const products: ProductDefinition[] = [
  {
    id: "1",
    details: {
      name: "Signature Letter Sweater",
      description: "A cozy hand-knit sweater, customisable to your taste.",
      slug: "signature-letter-sweater",
      image: "/images/signature-letter-sweater.jpg",
    },
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

export const getProductById = (id: string): ProductDefinition | undefined =>
  products.find((product) => product.id === id);

export const getAllProducts = (): ProductDefinition[] => products;
