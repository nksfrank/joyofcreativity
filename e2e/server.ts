import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

/**
 * The dev-server port this e2e run owns, derived from the working directory so
 * it is stable for this checkout yet distinct from every other.
 *
 * Why not the default 4321: `astro dev` runs as a shared background daemon, and
 * more than one agent (each in its own worktree) may have a server up at once,
 * plus a human/agent may keep a manual server on 4321. Latching onto any of
 * those risks a frozen or foreign-code server failing the suite. A per-checkout
 * port keeps this run's server off all of them. Override with E2E_PORT if needed.
 */
export const E2E_PORT = Number(
  process.env.E2E_PORT ??
    4400 + (createHash("sha1").update(process.cwd()).digest().readUInt16BE(0) % 400),
);

export const BASE_URL = `http://localhost:${E2E_PORT}/`;

/**
 * Free this worktree's dev server so a fresh one can start. `astro dev` runs as
 * a per-worktree singleton (registered in .astro/dev.json), so a server already
 * up here — a leftover e2e daemon or a manual one — would otherwise block a new
 * start. `astro dev stop` only ever touches this checkout's daemon, never another
 * worktree's, so concurrent agents elsewhere are unaffected. killPort is a
 * belt-and-suspenders in case a process outlived the registry entry.
 */
export function stopServer(): void {
  try {
    execSync("npx astro dev stop", { stdio: "ignore" });
  } catch {
    // No registered daemon, or it was already gone — nothing to stop.
  }
  killPort(E2E_PORT);
}

/**
 * Kill whatever is listening on `port`. Because E2E_PORT is unique to this
 * checkout, this only ever targets our own e2e server — never another agent's
 * or a manual dev server on 4321 — so it is safe to call before and after a run.
 */
export function killPort(port: number): void {
  try {
    const pids = execSync(`lsof -ti tcp:${port}`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    for (const pid of pids.split("\n").filter(Boolean)) {
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {
        // Already gone between listing and killing — fine.
      }
    }
  } catch {
    // lsof exits non-zero when nothing is listening: nothing to kill.
  }
}
