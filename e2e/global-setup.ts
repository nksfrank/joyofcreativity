import { execSync, spawn } from "node:child_process";
import { BASE_URL, E2E_PORT, stopServer } from "./server";

async function waitForReady(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) {
        return;
      }
    } catch {
      // Not accepting connections yet — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`e2e dev server never became ready at ${url}`);
}

/**
 * Own the server for the whole run rather than letting Playwright's `webServer`
 * launch it: `astro dev` always daemonizes, so the launched process exits the
 * instant it forks the daemon, which Playwright misreads as "server exited
 * early". Instead we free this worktree's server, (re)generate the i18n runtime
 * the config imports, migrate+seed the local D1 so the configurator's `getStock`
 * has live stock to read (#62), start a fresh daemon detached, and poll until it
 * serves.
 */
export default async function globalSetup(): Promise<void> {
  stopServer();
  execSync("npm run i18n", { stdio: "ignore" });
  // The configurator reads live stock from D1 on mount (#62); a fresh checkout's
  // local D1 has no `stock` table until migrated. Idempotent — a no-op once the
  // migrations (schema + fixture seed) are already applied.
  execSync("npm run db:migrate:local", { stdio: "ignore" });
  spawn("npx", ["astro", "dev", "--port", String(E2E_PORT)], {
    detached: true,
    stdio: "ignore",
  }).unref();
  await waitForReady(BASE_URL);
}
