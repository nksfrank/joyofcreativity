import { env } from "cloudflare:workers";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createDb, Database } from "./client";
import { buildSeedSyncSql } from "./seed";
import { getOnHand } from "./stock";

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
