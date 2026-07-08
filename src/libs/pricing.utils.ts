import type { Locale } from "@/i18n/runtime";
import type { Price } from "./pricing";

// SEK and EUR both use 2 decimal places; revisit this divisor if a zero-decimal currency is added.
export const formatMoney = (price: Price, locale: Locale): string =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency,
  }).format(price.amount / 100);
