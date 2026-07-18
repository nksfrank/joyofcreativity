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

/**
 * A point-in-time read of on-hand stock, keyed by blankId. The explicit stock
 * input the pure engines evaluate against (#58): the same engine can be fed a
 * live client snapshot or a direct server read. Sourced from D1 (#62) — the
 * server repo `getOnHandForBlanks` reads it, and the `getStock` Action hands it
 * to the configurator on mount. A blank absent from the map is treated as zero
 * on-hand. (The advisory `Blank.stock` fixture field is now read by nobody; its
 * removal is the follow-up contract step.)
 */
export type StockSnapshot = ReadonlyMap<string, Stock>;
