export const uniqueBy = <T, K>(items: T[], key: (item: T) => K): T[] => [
  ...new Map(items.map((item) => [key(item), item])).values(),
];
