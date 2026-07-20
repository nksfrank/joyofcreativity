import { drizzle } from "drizzle-orm/d1";
import { Context } from "effect";
import * as schema from "./schema";

/**
 * The one runtime driver, everywhere (#60, ADR-0015): `drizzle-orm/d1` over a
 * real D1 binding. Dev gets the binding from `astro dev`'s workerd; tests from
 * `@cloudflare/vitest-pool-workers` (a real, per-test-isolated D1); prod from
 * the remote binding. There is no second, node-side driver to keep in sync.
 */
export const createDb = (binding: D1Database) => drizzle(binding, { schema });

export type Db = ReturnType<typeof createDb>;

/**
 * The database as an Effect service (ADR-0014): D1 repos are `Effect.gen`
 * programs that declare {@link Database} as a requirement and read the client
 * from it. The caller — an
 * Action reading `env.DB` from `cloudflare:workers` (ADR-0013), never the
 * removed `Astro.locals.runtime.env` — builds the layer per invocation with
 * `Layer.succeed(Database, createDb(env.DB))` and provides it. Nothing reaches
 * for a binding itself.
 */
export class Database extends Context.Tag("Database")<Database, Db>() {}
