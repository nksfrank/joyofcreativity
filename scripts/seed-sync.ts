import { blanks } from "../src/libs/blank.ts";
import { buildSeedSyncSql } from "../src/server/db/seed.ts";

/**
 * Emit the deploy seed-sync SQL (#60) to stdout, built from the code-defined
 * Blanks. The `db:seed-sync:*` npm scripts capture it to a file and apply it
 * with `wrangler d1 execute`, so adding a Blank in code always reaches D1.
 *
 * Run with `node --experimental-strip-types` — no build step, no extra dep. The
 * imports resolve to plain `.ts` because `blank.ts` and `seed.ts` carry only
 * type imports / no imports, so type-stripping leaves nothing to resolve.
 */
process.stdout.write(buildSeedSyncSql(blanks.map((blank) => blank.id)));
