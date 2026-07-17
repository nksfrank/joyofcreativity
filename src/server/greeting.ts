import { Context, Effect, Schema } from "effect";
import type { ParseError } from "effect/ParseResult";

/**
 * The subset of the Cloudflare Worker environment the server layer depends on.
 *
 * Bindings are read from `import { env } from "cloudflare:workers"` at the RPC
 * boundary (ADR-0013) and provided into Effect programs as this service, so a
 * program never reaches for a runtime global itself — it declares the env as a
 * requirement and the caller supplies it (see `src/actions/index.ts`). Real
 * bindings (D1, the quote-signing key, Stripe) are added to this shape as they
 * arrive.
 */
export class ServerEnv extends Context.Tag("ServerEnv")<
  ServerEnv,
  { readonly SERVER_SURFACE_GREETING: string }
>() {}

/**
 * A domain-validated name to greet. `effect/Schema` is the server-side
 * validation story (ADR-0014): the Action boundary's zod schema guards the wire
 * shape Astro forces on it, and Schema refines that into a trusted domain value
 * here. `Schema.Trim` normalises surrounding whitespace before the length
 * bounds are checked.
 */
export const Name = Schema.Trim.pipe(
  Schema.minLength(1, { message: () => "Name must not be empty" }),
  Schema.maxLength(50, { message: () => "Name must be at most 50 characters" }),
);

/** The shape the server hands back for a greeting request. */
export const Greeting = Schema.Struct({
  message: Schema.String,
});
export type Greeting = Schema.Schema.Type<typeof Greeting>;

/**
 * Trivial demo program (issue #57): decode an untrusted name, combine it with a
 * value read from the Cloudflare env, and return a typed {@link Greeting}. This
 * is the shape every later server unit follows — an `Effect.gen` program that
 * declares a {@link ServerEnv} requirement and validates its inputs with Schema,
 * run by the caller with the env provided as a Layer.
 */
export const greet = (
  rawName: string,
): Effect.Effect<Greeting, ParseError, ServerEnv> =>
  Effect.gen(function* () {
    const name = yield* Schema.decode(Name)(rawName);
    const { SERVER_SURFACE_GREETING } = yield* ServerEnv;
    return { message: `${SERVER_SURFACE_GREETING}, ${name}!` };
  });
