import { Context, Effect, Layer } from "effect";
import type { CurrencyCode, Price } from "@/libs/money";
import type { ProductOrderItem } from "@/libs/product.types";

/**
 * The signed quote — the price lock (#64, ADR-0016 superseding ADR-0004).
 *
 * ADR-0001 keeps the cart client-side with no server-side cart table, so the
 * server cannot hold a checkout it can re-read at commit. Instead it returns a
 * quote signed with an HMAC over the priced cart; the client carries it to
 * commit, and a valid signature is the server's own attestation — there is
 * nothing left to re-confirm. A tampered line, price, config, currency, or an
 * expired `expiresAt` all fail verification (bucket 1 at the commit boundary).
 */

/** Hours-to-live before a locked quote must be re-validated and re-priced. The one tunable. */
export const QUOTE_TTL_MS = 24 * 60 * 60 * 1000;

/** One priced line inside a quote: the server's unit price for a re-validated order item. */
export type QuoteLine = {
  productId: string;
  item: ProductOrderItem;
  quantity: number;
  /** The server-computed unit price (ADR-0004 superseded): authoritative, never browser-computed. */
  unitPrice: Price;
};

/** The signed body: everything the HMAC covers. Single-currency by construction (`currency`). */
export type QuotePayload = {
  lines: readonly QuoteLine[];
  currency: CurrencyCode;
  /** Epoch millis the quote was issued. */
  issuedAt: number;
  /** Epoch millis the price lock lapses (issuedAt + QUOTE_TTL_MS). */
  expiresAt: number;
  /** A random id so two identical carts still produce distinct quotes. */
  quoteId: string;
};

/** A quote plus its detached HMAC signature — what `validateCheckout` returns and the client carries. */
export type SignedQuote = QuotePayload & {
  /** Base64 HMAC-SHA256 over the canonical payload, keyed by the quote-signing secret. */
  signature: string;
};

/** The verdict of checking a carried quote back at the commit boundary. */
export type QuoteVerification =
  | { valid: true; payload: QuotePayload }
  | { valid: false; reason: "signature" | "expired" };

const encoder = new TextEncoder();

/**
 * A deterministic serialization of the payload so signing and verifying hash the
 * exact same bytes regardless of a JSON round-trip's key order. Object keys are
 * sorted recursively; array order is preserved (yarn colour order is part of the
 * order item the client submitted, so it is signed as given).
 */
export const canonicalQuoteString = (payload: QuotePayload): string =>
  JSON.stringify(canonicalize(payload));

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [
          key,
          canonicalize((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
};

const toBase64 = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));

const importKey = (key: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

const hmac = async (key: string, message: string): Promise<string> => {
  const cryptoKey = await importKey(key);
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );
  return toBase64(signature);
};

/** Length-safe, timing-safe comparison of two base64 signatures. */
const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
};

/** Sign a priced payload, returning the payload plus its detached HMAC signature. */
export const signQuote = async (
  payload: QuotePayload,
  key: string,
): Promise<SignedQuote> => ({
  ...payload,
  signature: await hmac(key, canonicalQuoteString(payload)),
});

/**
 * Verify a carried quote against the signing key and the clock. Any edit to a
 * line, price, config, or currency changes the canonical bytes and fails the
 * signature check; a lapsed `expiresAt` fails the expiry check. Both collapse to
 * bucket 1 (tampered) at the commit boundary.
 */
export const verifyQuote = async (
  quote: SignedQuote,
  now: number,
  key: string,
): Promise<QuoteVerification> => {
  const { signature, ...payload } = quote;
  const expected = await hmac(key, canonicalQuoteString(payload));
  if (!constantTimeEqual(signature, expected)) {
    return { valid: false, reason: "signature" };
  }
  if (now >= payload.expiresAt) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, payload };
};

/**
 * The quote-signing port as an Effect service (mirroring the Stripe port,
 * ADR-0014): callers depend on `QuoteSigner`, never on the raw secret. The live
 * layer closes over the one new Workers secret (`QUOTE_SIGNING_KEY`), read at the
 * Action boundary from `cloudflare:workers`; unit tests build one over a literal
 * test key with no env.
 */
export interface QuoteSignerService {
  readonly sign: (payload: QuotePayload) => Effect.Effect<SignedQuote>;
  readonly verify: (
    quote: SignedQuote,
    now: number,
  ) => Effect.Effect<QuoteVerification>;
}

export class QuoteSigner extends Context.Tag("QuoteSigner")<
  QuoteSigner,
  QuoteSignerService
>() {}

/** Build the live {@link QuoteSigner} layer over a signing key. */
export const makeQuoteSigner = (key: string): Layer.Layer<QuoteSigner> =>
  Layer.succeed(QuoteSigner, {
    sign: (payload) => Effect.promise(() => signQuote(payload, key)),
    verify: (quote, now) => Effect.promise(() => verifyQuote(quote, now, key)),
  });
