import { Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { greet, ServerEnv } from "./greeting";

/** A fixed env, standing in for the per-request Cloudflare binding. */
const testEnv = Layer.succeed(ServerEnv, {
  SERVER_SURFACE_GREETING: "Hej",
});

const run = <A, E>(program: Effect.Effect<A, E, ServerEnv>) =>
  Effect.runPromiseExit(Effect.provide(program, testEnv));

describe("greet", () => {
  it("combines the env-sourced prefix with the given name", async () => {
    const exit = await run(greet("Astro"));
    expect(exit).toStrictEqual(Exit.succeed({ message: "Hej, Astro!" }));
  });

  it("trims surrounding whitespace from the name", async () => {
    const exit = await run(greet("  Astro  "));
    expect(exit).toStrictEqual(Exit.succeed({ message: "Hej, Astro!" }));
  });

  it("fails to decode an empty name", async () => {
    const exit = await run(greet("   "));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("fails to decode a name longer than 50 characters", async () => {
    const exit = await run(greet("a".repeat(51)));
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
