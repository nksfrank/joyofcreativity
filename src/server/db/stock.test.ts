import { env } from "cloudflare:workers";
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { getProductById } from "@/libs/product";
import { createDb, Database } from "./client";
import { buildSeedSyncSql } from "./seed";
import {
  getOnHand,
  getOnHandForBlanks,
  getStockForProduct,
  ProductNotFoundError,
} from "./stock";

// Runs on the workers pool against a real, per-test-isolated D1 that
// `apply-migrations.ts` has migrated and seeded (schema 0000 + fixture seed
// 0001). Expected on-hand values are the fixture literals from
// `src/libs/blank.ts` — an independent source of truth, not recomputed here.
describe("stock (real migrated D1)", () => {
  // Provide the D1 layer per the ADR-0014 shape: the repo declares the
  // `Database` requirement, the caller supplies `createDb(env.DB)`.
  const onHand = (blankId: string) =>
    Effect.runPromise(
      getOnHand(blankId).pipe(
        Effect.provideService(Database, createDb(env.DB)),
      ),
    );

  it("reads the seeded on-hand for a blank", async () => {
    expect(await onHand("blank1")).toBe(5);
    expect(await onHand("blank2")).toBe(3);
  });

  it("reads a seeded zero as 0, distinct from an unknown blank as undefined", async () => {
    expect(await onHand("blank3")).toBe(0);
    expect(await onHand("no-such-blank")).toBeUndefined();
  });

  it("refuses to persist negative stock (on_hand >= 0 check)", async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO stock (blank_id, on_hand) VALUES ('blank1', -1)",
      ).run(),
    ).rejects.toThrow();
  });

  // The batched snapshot read a `getStock` Action feeds the configurator (#62)
  // and the checkout boundary reuses. Provided the same D1 layer as `getOnHand`.
  const snapshot = (blankIds: readonly string[]) =>
    Effect.runPromise(
      getOnHandForBlanks(blankIds).pipe(
        Effect.provideService(Database, createDb(env.DB)),
      ),
    );

  describe("getOnHandForBlanks (snapshot for a product family)", () => {
    it("reads seeded on-hand for every requested blank as a Map", async () => {
      const map = await snapshot(["blank1", "blank2", "blank3"]);
      expect([...map.entries()].sort()).toStrictEqual([
        ["blank1", 5],
        ["blank2", 3],
        ["blank3", 0],
      ]);
    });

    it("distinguishes a seeded zero from an unknown blank (absent from the map)", async () => {
      const map = await snapshot(["blank3", "no-such-blank"]);
      expect(map.get("blank3")).toBe(0);
      expect(map.has("no-such-blank")).toBe(false);
    });

    it("returns an empty map for no blanks without touching D1", async () => {
      const map = await snapshot([]);
      expect(map.size).toBe(0);
    });
  });

  // The product-family read the `getStock` Action delegates to (#62): resolve a
  // family's offered blanks and read their live on-hand from D1 in one snapshot.
  const stockForProduct = (productId: string) =>
    Effect.runPromiseExit(
      getStockForProduct(productId).pipe(
        Effect.provideService(Database, createDb(env.DB)),
      ),
    );

  describe("getStockForProduct (the Action's resolve-then-read)", () => {
    it("returns the live on-hand for exactly the family's offered blanks", async () => {
      const exit = await stockForProduct("1");
      if (Exit.isFailure(exit)) throw new Error("expected success");

      // Keyed by the blanks product 1 offers — nothing more, nothing less — and
      // valued from the seeded D1 rows (blank1 = 5, blank3 = 0).
      const offered = getProductById("1")?.blanks.map((b) => b.blankId) ?? [];
      expect([...exit.value.keys()].sort()).toStrictEqual([...offered].sort());
      expect(exit.value.get("blank1")).toBe(5);
      expect(exit.value.get("blank3")).toBe(0);
    });

    it("fails with ProductNotFoundError for an unknown family", async () => {
      const exit = await stockForProduct("no-such-product");
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isSuccess(exit)) throw new Error("expected failure");
      const failure = exit.cause;
      expect(failure._tag).toBe("Fail");
      if (failure._tag !== "Fail") throw new Error("expected a typed failure");
      expect(failure.error).toBeInstanceOf(ProductNotFoundError);
    });
  });

  describe("seed-sync", () => {
    it("inserts on_hand = 0 for a code-defined blank with no row", async () => {
      const sql = buildSeedSyncSql(["fresh-blank"]);
      await env.DB.prepare(sql).run();

      expect(await onHand("fresh-blank")).toBe(0);
    });

    it("leaves an existing row's on_hand untouched", async () => {
      // blank1 is already seeded at 5; the seed-sync would insert it at 0.
      const sql = buildSeedSyncSql(["blank1", "fresh-blank"]);
      await env.DB.prepare(sql).run();

      expect(await onHand("blank1")).toBe(5);
      expect(await onHand("fresh-blank")).toBe(0);
    });
  });
});
