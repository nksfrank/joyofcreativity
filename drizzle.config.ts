import { defineConfig } from "drizzle-kit";

/**
 * Authoring only (#60, ADR-0015). `drizzle-kit generate` reads the schema and
 * writes plain-SQL migrations into `drizzle/migrations`; nothing here ever
 * *applies* them — `wrangler d1 migrations apply` does, from the same directory
 * (see `migrations_dir` in wrangler.jsonc). Generation is fully offline, so the
 * `d1-http` credentials below are only consulted by `drizzle-kit studio` and
 * are read from the environment (unset ⇒ empty, which is fine until you open
 * studio against remote D1).
 */
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? "",
    token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
  },
});
