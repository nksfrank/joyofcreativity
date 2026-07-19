import { describe, expect, it } from "vitest";
import {
  QUOTE_TTL_MS,
  type QuoteLine,
  type QuotePayload,
  type SignedQuote,
  signQuote,
  type VerifiedQuote,
  verifyQuote,
} from "./quote";

/** Patch the first line of a signed quote — the tampering a client might attempt. */
const editFirstLine = (
  signed: SignedQuote,
  patch: Partial<QuoteLine>,
): SignedQuote => {
  const [first, ...rest] = signed.lines;
  if (!first) throw new Error("expected a line to edit");
  return { ...signed, lines: [{ ...first, ...patch }, ...rest] };
};

const KEY = "test-signing-key";
const ISSUED_AT = 1_700_000_000_000;

/** A representative single-line, single-currency payload. */
const payload = (): QuotePayload => ({
  lines: [
    {
      productId: "1",
      item: {
        blankId: "blank1",
        patternId: "plain",
        yarnColorIds: ["ivory"],
        customisation: "AB",
      },
      quantity: 2,
      unitPrice: { amount: 87800, currency: "SEK" },
    },
  ],
  currency: "SEK",
  issuedAt: ISSUED_AT,
  expiresAt: ISSUED_AT + QUOTE_TTL_MS,
  quoteId: "quote-1",
});

/** A moment safely inside the 24h lock. */
const withinLock = ISSUED_AT + 60_000;

describe("quote HMAC sign/verify", () => {
  it("verifies an unedited signed quote within its lock window", async () => {
    const signed = await signQuote(payload(), KEY);
    const result = await verifyQuote(signed, withinLock, KEY);

    expect(result.valid).toBe(true);
  });

  it("survives a JSON round-trip (client carries it verbatim to commit)", async () => {
    const signed = await signQuote(payload(), KEY);
    const carried: SignedQuote = JSON.parse(JSON.stringify(signed));

    const result = await verifyQuote(carried, withinLock, KEY);
    expect(result.valid).toBe(true);
  });

  it("rejects a quote signed with a different key", async () => {
    const signed = await signQuote(payload(), KEY);
    const result = await verifyQuote(signed, withinLock, "other-key");

    expect(result).toStrictEqual({ valid: false, reason: "signature" });
  });

  it("rejects an edited unit price (bucket 1 at commit)", async () => {
    const signed = await signQuote(payload(), KEY);
    const tampered = editFirstLine(signed, {
      unitPrice: { amount: 1, currency: "SEK" },
    });

    const result = await verifyQuote(tampered, withinLock, KEY);
    expect(result).toStrictEqual({ valid: false, reason: "signature" });
  });

  it("rejects an edited line configuration", async () => {
    const signed = await signQuote(payload(), KEY);
    const tampered = editFirstLine(signed, {
      item: {
        blankId: "blank1",
        patternId: "plain",
        yarnColorIds: ["ivory"],
        customisation: "HACKED",
      },
    });

    const result = await verifyQuote(tampered, withinLock, KEY);
    expect(result).toStrictEqual({ valid: false, reason: "signature" });
  });

  it("rejects an edited quantity", async () => {
    const signed = await signQuote(payload(), KEY);
    const tampered = editFirstLine(signed, { quantity: 999 });

    const result = await verifyQuote(tampered, withinLock, KEY);
    expect(result).toStrictEqual({ valid: false, reason: "signature" });
  });

  it("rejects an edited currency", async () => {
    const signed = await signQuote(payload(), KEY);
    const tampered: SignedQuote = { ...signed, currency: "EUR" };

    const result = await verifyQuote(tampered, withinLock, KEY);
    expect(result).toStrictEqual({ valid: false, reason: "signature" });
  });

  it("rejects a quote past its expiry (the one moment a locked price can lapse)", async () => {
    const signed = await signQuote(payload(), KEY);
    const afterExpiry = signed.expiresAt + 1;

    const result = await verifyQuote(signed, afterExpiry, KEY);
    expect(result).toStrictEqual({ valid: false, reason: "expired" });
  });

  it("returns the verified payload on success", async () => {
    const original = payload();
    const signed = await signQuote(original, KEY);

    const result = await verifyQuote(signed, withinLock, KEY);
    if (!result.valid) throw new Error("expected a valid quote");
    // The brand is phantom — the payload still deep-equals the original body;
    // only its *type* now proves provenance (widened here for the comparison).
    expect(result.payload as QuotePayload).toStrictEqual(original);
  });

  it("cannot mint a VerifiedQuote outside verifyQuote (compile-time guard)", () => {
    // A plain payload is structurally a QuotePayload but lacks the private
    // brand, so it is NOT assignable to VerifiedQuote. If this ever compiles
    // (brand removed/weakened), the unused @ts-expect-error fails the build —
    // the structural guarantee behind ADR-0017 regressing becomes a red build.
    // @ts-expect-error a QuotePayload is not a verified quote — only verifyQuote mints one
    const forged: VerifiedQuote = payload();
    expect(forged).toBeDefined();
  });
});
