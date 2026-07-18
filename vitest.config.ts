import { defineConfig } from "vitest/config";

/**
 * Two projects, two pools (#60). The pure engines and stores run on the default
 * node pool (fast, no runtime); anything that touches D1 runs on
 * `@cloudflare/vitest-pool-workers` against a real, per-test-isolated D1. Keeping
 * them split means a schema change can't slow the whole suite down to workerd
 * boot time, and a pure-engine test can never accidentally depend on a binding.
 */
export default defineConfig({
  test: {
    projects: ["./vitest.node.config.ts", "./vitest.workers.config.ts"],
  },
});
