import { env } from "cloudflare:workers";
import { Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { createDb, Database } from "@/server/db/client";
import { validateCheckout } from "./checkout";
import { makeQuoteSigner, verifyQuote } from "./quote";

// Runs on the workers pool against the real migrated + seeded D1 (`apply-
// migrations.ts`): fixture on-hand is blank1 = 5, blank2 = 3, blank3 = 0. The
// signing key is a literal — no Workers secret is read in the test path.
const KEY = "integration-signing-key";
const NOW = 1_700_000_000_000;

const run = (request: unknown) =>
  Effect.runPromiseExit(
    validateCheckout(request, NOW).pipe(
      Effect.provide(
        Layer.merge(
          Layer.succeed(Database, createDb(env.DB)),
          makeQuoteSigner(KEY),
        ),
      ),
    ),
  );

const good = {
  productId: "1",
  item: {
    blankId: "blank1",
    patternId: "plain",
    yarnColorIds: ["ivory"],
    customisation: "",
  },
  quantity: 2,
};

describe("validateCheckout (real migrated D1)", () => {
  it("returns a verifiable signed quote for a good cart, priced server-side", async () => {
    const exit = await run({ lines: [good] });
    if (Exit.isFailure(exit)) throw new Error("expected success");

    const result = exit.value;
    if (!result.ok) throw new Error("expected a quote");

    // base 79900 + ivory 2000 = 81900, computed by the shared PricingManager.
    expect(result.quote.lines).toStrictEqual([
      { ...good, unitPrice: { amount: 81900, currency: "SEK" } },
    ]);
    expect(result.quote.currency).toBe("SEK");
    expect(result.quote.expiresAt).toBeGreaterThan(result.quote.issuedAt);

    const verified = await verifyQuote(result.quote, NOW + 60_000, KEY);
    expect(verified.valid).toBe(true);
  });

  it("classifies each bad line into its bucket, all problems returned together", async () => {
    const exit = await run({
      lines: [
        // bucket 1: unknown product
        { ...good, productId: "no-such-product" },
        // bucket 1: blank not offered
        { ...good, item: { ...good.item, blankId: "blank99" } },
        // bucket 1: wrong yarn count for "signature" (needs 3)
        { ...good, item: { ...good.item, patternId: "signature" } },
        // bucket 2: discontinued yarn "moss" with the right count for "signature"
        {
          ...good,
          item: {
            ...good.item,
            patternId: "signature",
            yarnColorIds: ["moss", "ivory", "charcoal"],
          },
        },
        // bucket 3: blank3 is seeded at 0 on hand
        { ...good, item: { ...good.item, blankId: "blank3" }, quantity: 1 },
      ],
    });
    if (Exit.isFailure(exit)) throw new Error("expected success");

    const result = exit.value;
    if (result.ok) throw new Error("expected problems");
    expect(result.problems.map((p) => [p.index, p.bucket])).toStrictEqual([
      [0, "tampered"],
      [1, "tampered"],
      [2, "tampered"],
      [3, "unavailable"],
      [4, "out_of_stock"],
    ]);
  });

  it("flags out-of-stock against live D1 (blank2 seeded at 3, quantity 5)", async () => {
    const exit = await run({
      lines: [
        { ...good, item: { ...good.item, blankId: "blank2" }, quantity: 5 },
      ],
    });
    if (Exit.isFailure(exit)) throw new Error("expected success");

    const result = exit.value;
    if (result.ok) throw new Error("expected problems");
    expect(result.problems[0]?.bucket).toBe("out_of_stock");
    expect(result.problems[0]?.reasons[0]).toContain("3 on hand");
  });
});
