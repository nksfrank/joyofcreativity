import { ActionError } from "astro:actions";
import { Cause, Effect, Exit, type Layer } from "effect";

/**
 * Translate a program's typed failure into the `ActionError` the RPC boundary
 * throws, or return `undefined` to let it fall through to the 500 fallback.
 * Each Action supplies its own — a `ParseError` is a `BAD_REQUEST`, an unknown
 * product a `NOT_FOUND`, and so on — so the error→HTTP mapping lives next to the
 * Action it belongs to, not copied into every handler.
 */
export type ActionErrorTranslator<E> = (failure: E) => ActionError | undefined;

/**
 * The one adapter every Astro Action runs its Effect program through (ADR-0014).
 *
 * ADR-0014 admitted Effect at the RPC boundary specifically so cross-cutting
 * policies (retry, timeout, rate-limiting) could be applied uniformly to every
 * Action. This is that single place: provide the per-invocation layer, run the
 * program to an `Exit`, hand back a success value, and translate a typed failure
 * to an `ActionError` — a defect or an untranslated failure becomes a 500. A new
 * policy is added here once, not in five handlers.
 *
 * The `translate` receives the program's typed error (`E`) directly — narrow on
 * `_tag` or `isParseError` — and returns the `ActionError` to throw, or
 * `undefined` to defer to `fallbackMessage`.
 */
export const runAction = async <A, E, R>(
  program: Effect.Effect<A, E, R>,
  layer: Layer.Layer<R>,
  options: {
    readonly translate?: ActionErrorTranslator<E>;
    readonly fallbackMessage: string;
  },
): Promise<A> => {
  const exit = await Effect.runPromiseExit(Effect.provide(program, layer));

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  // A typed failure the Action knows how to map becomes its chosen 4xx; any
  // other failure (a defect, or a typed error the handler doesn't translate)
  // must not masquerade as a client error, so it falls through to a 500.
  const failure = Cause.failureOption(exit.cause);
  if (failure._tag === "Some") {
    const mapped = options.translate?.(failure.value);
    if (mapped) {
      throw mapped;
    }
  }

  throw new ActionError({
    code: "INTERNAL_SERVER_ERROR",
    message: options.fallbackMessage,
  });
};
