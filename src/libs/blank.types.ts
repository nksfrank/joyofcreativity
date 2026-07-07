type Stock = number;

export type Color = {
  id: string;
  name: string;
};

export type Size = {
  id: string;
  name: string;
};

/**
 * The physical raw good behind a product: one Color x Size combination.
 * Stock lives here, not on any product, because it's shared inventory —
 * selling any product built from this blank draws down the same count.
 */
export type Blank = {
  id: string;
  colorId: string;
  sizeId: string;
  stock: Stock;
};
