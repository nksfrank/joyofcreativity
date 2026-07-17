import { ActionError, defineAction } from "astro:actions";
// Astro's `defineAction` input is typed to zod's own schema type, so this one
// boundary uses `astro/zod` (which re-exports the zod Astro already ships).
// Everything past this line is Effect + effect/Schema (ADR-0014).
import { env } from "cloudflare:workers";
import { z } from "astro/zod";
import { Cause, Effect, Exit, Layer } from "effect";
import { isParseError, TreeFormatter } from "effect/ParseResult";
import { greet, ServerEnv } from "@/server/greeting";

/**
 * The island-facing RPC surface (ADR-0013). The zod `input` here guards only
 * the wire shape Astro's `defineAction` forces (ADR-0014); the real domain
 * validation is `effect/Schema` inside `src/server/`. Each Action hands off to
 * an Effect program there, providing the Cloudflare env — read from
 * `cloudflare:workers` — as a Layer. This boundary is where cross-cutting
 * policies (retry, timeout, rate-limiting) would compose over the program.
 */
export const server = {
  greet: defineAction({
    input: z.object({
      name: z.string(),
    }),
    handler: async ({ name }) => {
      const runtimeEnv = Layer.succeed(ServerEnv, {
        SERVER_SURFACE_GREETING: env.SERVER_SURFACE_GREETING,
      });

      const exit = await Effect.runPromiseExit(
        Effect.provide(greet(name), runtimeEnv),
      );

      if (Exit.isSuccess(exit)) {
        return exit.value;
      }

      // A Schema decode error on `name` is a client mistake → bad request with
      // its message. Any other failure (a defect, or a future typed error the
      // handler doesn't yet translate) must not masquerade as a 400.
      const failure = Cause.failureOption(exit.cause);
      if (failure._tag === "Some" && isParseError(failure.value)) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: TreeFormatter.formatErrorSync(failure.value),
        });
      }
      throw new ActionError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Greeting failed unexpectedly",
      });
    },
  }),
};
