/**
 * UUIDv7 — the public order reference (#65).
 *
 * An order's `id` is carried in URLs, receipt emails, and Stripe session
 * metadata, so it must be URL/email-safe (a hyphenated hex UUID is), hard to
 * guess (74 random bits), and time-sortable (a v7's leading 48 bits are the
 * creation millisecond, so ids sort in issue order). `crypto.randomUUID()` (v4,
 * the existing `quoteId` convention) is none of the last two, so this is the one
 * place the shop mints a v7 instead of reaching for a dependency.
 *
 * Layout (RFC 9562 §5.7): 48-bit big-endian millisecond timestamp, the 4-bit
 * version `0111`, 12 random bits, the 2-bit variant `10`, then 62 random bits.
 * `now` is a parameter so a caller can mint the order id from the same clock it
 * stamps the row with, and tests can assert the encoded timestamp.
 */
export const uuidv7 = (now: number = Date.now()): string => {
  const bytes = new Uint8Array(16);

  // 48-bit timestamp, most-significant byte first, into bytes[0..5].
  const ms = BigInt(now);
  for (let i = 0; i < 6; i++) {
    bytes[i] = Number((ms >> BigInt((5 - i) * 8)) & 0xffn);
  }

  // The remaining 10 bytes are random; version and variant nibbles overwrite bits.
  crypto.getRandomValues(bytes.subarray(6));
  // `?? 0` only to satisfy strict indexed access — `getRandomValues` has filled
  // every byte, so these reads are never actually undefined.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // version 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC variant (10xx)

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
};
