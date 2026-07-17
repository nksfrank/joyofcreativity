import { expect, test } from "@playwright/test";

const DEMO_ROUTE = "/dev/server-check";

/** The env value the demo binding carries (wrangler.jsonc → SERVER_SURFACE_GREETING). */
const ENV_GREETING = "hello from the cloudflare edge";

test("a hydrated island reaches server code that reads a Cloudflare binding", async ({
  page,
}) => {
  await page.goto(DEMO_ROUTE);

  // The island calls the `greet` Astro Action on mount; the reply proves the
  // whole chain — island → src/actions → src/server (Effect + Schema) → the
  // Cloudflare env binding — works end-to-end. The value it echoes back can only
  // have come from the binding, so its presence is the assertion.
  await expect(page.getByTestId("server-check-message")).toContainText(
    ENV_GREETING,
    { timeout: 10_000 },
  );
  await expect(page.getByTestId("server-check-error")).toHaveCount(0);
});

test("the route is genuinely on-demand rendered, not statically cached", async ({
  page,
}) => {
  // prerender = false stamps a fresh time per request. A statically cached page
  // would return the identical build-time value on every load, so two differing
  // timestamps are the discriminating signal that the route is server-rendered.
  await page.goto(DEMO_ROUTE);
  const first = await page.getByTestId("rendered-at").innerText();

  await page.goto(DEMO_ROUTE);
  const second = await page.getByTestId("rendered-at").innerText();

  expect(first).not.toBe(second);
});
