import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { createDb, Database } from "@/server/db/client";
import { orderItems, orders, stock } from "@/server/db/schema";
import { makeFakeStripe } from "@/server/stripe";
import { validateCheckout } from "./checkout";
import { makeQuoteSigner, QUOTE_TTL_MS, type SignedQuote } from "./quote";
import { createCheckoutSession } from "./session";

// Runs on the workers pool against the real migrated + seeded D1 (`apply-
// migrations.ts`): fixture on-hand is blank1 = 5, blank2 = 3, blank3 = 0. The
// signing key is a literal — no Workers secret is read in the test path.
const KEY = "integration-signing-key";
const NOW = 1_700_000_000_000;
const RETURN_URL = "https://shop.example/checkout/return";

const db = createDb(env.DB);
const signer = makeQuoteSigner(KEY);

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

/** Mint a real signed quote the way the client would — via `validateCheckout`. */
const issueQuote = async (request: unknown): Promise<SignedQuote> => {
  const result = await Effect.runPromise(
    validateCheckout(request, NOW).pipe(
      Effect.provide(Layer.merge(Layer.succeed(Database, db), signer)),
    ),
  );
  if (!result.ok) throw new Error("expected a signed quote");
  return result.quote;
};

const runSession = (
  quote: SignedQuote,
  fake: ReturnType<typeof makeFakeStripe>,
  now = NOW,
) =>
  Effect.runPromiseExit(
    createCheckoutSession(quote, RETURN_URL, now).pipe(
      Effect.provide(
        Layer.mergeAll(Layer.succeed(Database, db), signer, fake.layer),
      ),
    ),
  );

const onHand = (blankId: string) =>
  db
    .select({ onHand: stock.onHand })
    .from(stock)
    .where(eq(stock.blankId, blankId))
    .get();

describe("createCheckoutSession (real migrated D1, faked Stripe)", () => {
  it("writes a pending order and hands the client_secret + reference to Stripe", async () => {
    const quote = await issueQuote({ lines: [good] });
    const fake = makeFakeStripe({
      session: { id: "cs_test_x", clientSecret: "cs_test_x_secret" },
    });

    const exit = await runSession(quote, fake);
    if (Exit.isFailure(exit)) throw new Error("expected success");
    const result = exit.value;
    if (!result.ok) throw new Error("expected an ok session");

    // The client gets what it mounts, plus the public reference (a UUIDv7).
    expect(result.clientSecret).toBe("cs_test_x_secret");
    expect(result.orderReference).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    // Reference-id handoff: exactly one Stripe call, inline price_data from the
    // LOCKED price, and only the compact reference in metadata.
    expect(fake.calls.createCheckoutSession).toHaveLength(1);
    const call = fake.calls.createCheckoutSession[0];
    expect(call?.returnUrl).toBe(RETURN_URL);
    expect(call?.metadata).toStrictEqual({
      orderReference: result.orderReference,
    });
    expect(call?.lineItems).toStrictEqual([
      {
        name: "Cream Small — Plain",
        price: { amount: 81900, currency: "SEK" },
        quantity: 2,
      },
    ]);

    // The order row: single currency on the order, minor units on the line.
    const orderRow = await db
      .select()
      .from(orders)
      .where(eq(orders.id, result.orderReference))
      .get();
    expect(orderRow).toStrictEqual({
      id: result.orderReference,
      currency: "SEK",
      createdAt: NOW,
    });

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, result.orderReference))
      .all();
    expect(items).toStrictEqual([
      {
        id: expect.any(Number),
        orderId: result.orderReference,
        productId: "1",
        blankId: "blank1",
        patternId: "plain",
        yarnColorIds: ["ivory"],
        customisation: "",
        unitAmount: 81900,
        quantity: 2,
        display: "Cream Small — Plain",
      },
    ]);

    // Stock is never held or decremented here (#34/#35): blank1 stays at its
    // seeded 5 after a successful session.
    expect((await onHand("blank1"))?.onHand).toBe(5);
  });

  it("blocks a quote whose signature does not verify — no order, no Stripe call", async () => {
    const quote = await issueQuote({ lines: [good] });
    const tampered: SignedQuote = { ...quote, signature: "not-a-signature" };
    const fake = makeFakeStripe();

    const exit = await runSession(tampered, fake);
    if (Exit.isFailure(exit)) throw new Error("expected a handled result");
    const result = exit.value;
    if (result.ok) throw new Error("expected a blocked result");
    // A forged signature is a cart-level `tampered` problem — the same taxonomy
    // the add-time checkpoint uses (candidate 3).
    expect(result.problems.map((p) => [p.index, p.bucket])).toStrictEqual([
      [-1, "tampered"],
    ]);
    expect(fake.calls.createCheckoutSession).toHaveLength(0);
  });

  it("blocks an expired quote (price lock lapsed) — no Stripe call", async () => {
    const quote = await issueQuote({ lines: [good] });
    const fake = makeFakeStripe();

    const exit = await runSession(quote, fake, NOW + QUOTE_TTL_MS + 1);
    if (Exit.isFailure(exit)) throw new Error("expected a handled result");
    const result = exit.value;
    if (result.ok) throw new Error("expected a blocked result");
    // A lapsed lock is `price_drift` — the one sanctioned producer of that bucket.
    expect(result.problems.map((p) => [p.index, p.bucket])).toStrictEqual([
      [-1, "price_drift"],
    ]);
    expect(fake.calls.createCheckoutSession).toHaveLength(0);
  });

  it("re-checks stock at commit (TOCTOU): a line that lost cover blocks the session", async () => {
    // Quote issued while blank2 covers qty 3, then depleted before commit.
    const line = {
      ...good,
      item: { ...good.item, blankId: "blank2" },
      quantity: 3,
    };
    const quote = await issueQuote({ lines: [line] });
    const fake = makeFakeStripe();

    try {
      await db
        .update(stock)
        .set({ onHand: 2 })
        .where(eq(stock.blankId, "blank2"));

      const exit = await runSession(quote, fake);
      if (Exit.isFailure(exit)) throw new Error("expected a handled result");
      const result = exit.value;
      if (result.ok) throw new Error("expected a blocked result");
      // The TOCTOU shortfall surfaces per line, in the shared taxonomy.
      expect(result.problems.map((p) => [p.index, p.bucket])).toStrictEqual([
        [0, "out_of_stock"],
      ]);
      // Blocked before Stripe, and the gate never touched stock.
      expect(fake.calls.createCheckoutSession).toHaveLength(0);
      expect((await onHand("blank2"))?.onHand).toBe(2);
    } finally {
      await db
        .update(stock)
        .set({ onHand: 3 })
        .where(eq(stock.blankId, "blank2"));
    }
  });
});
