import { stopServer } from "./server";

/**
 * Stop the daemon global-setup started. If a run crashes before this fires, the
 * next run's global-setup frees the same server first, so it is self-healing.
 */
export default async function globalTeardown(): Promise<void> {
  stopServer();
}
