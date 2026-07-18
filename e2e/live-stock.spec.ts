import { execSync } from "node:child_process";
import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Live D1 stock reaches the configurator (#62). The configurator no longer reads
 * the fixture `blank.stock`; on mount it calls the `getStock` Action, which reads
 * `on_hand` from the D1 store the shop controls, and disables options per that
 * live snapshot. This proves the whole chain end-to-end — a D1 write shows up as
 * a disabled size option, and reverting it re-enables the option.
 *
 * The mutated Blank is `blank4` (product 1, colour Red, size Small). No other e2e
 * spec visits the Red colour — the configurator journeys all land on Cream (the
 * first colour variant) — so toggling Red's Small stock can't perturb them, even
 * under Playwright's full parallelism.
 */
const RED_BLANK = "blank4";

/** Set a Blank's on-hand directly in the local D1 the dev server reads. */
function setOnHand(blankId: string, onHand: number): void {
  execSync(
    `npx wrangler d1 execute joyofcreativity --local --command "UPDATE stock SET on_hand = ${onHand} WHERE blank_id = '${blankId}'"`,
    { stdio: "ignore" },
  );
}

/** The first product card offering more than one colour is product 1. */
async function openProductOneRed(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Sweaters" }).click();
  await expect(page.getByRole("heading", { name: "Sweaters" })).toBeVisible();

  const cards = page.getByTestId("product-card");
  await expect(cards.first()).toBeVisible();

  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const variants = card.getByTestId("product-card-variants");
    if ((await variants.getByRole("link").count()) > 1) {
      await variants.getByRole("link", { name: "Red" }).click();
      await page.waitForLoadState("networkidle");
      return;
    }
  }
  throw new Error("No multi-colour product card to reach Red from");
}

function sizeRadio(page: Page, name: string): Locator {
  return page.getByRole("group", { name: "Size" }).getByRole("radio", { name });
}

// The configurator shows a loading state until `getStock` resolves; the first
// call also pays a one-off dev-server route compile. Wait that out before
// asserting on the (post-load) size options.
async function waitForStockLoaded(page: Page): Promise<void> {
  await expect(page.getByText("Loading availability…")).toHaveCount(0, {
    timeout: 30_000,
  });
}

test("live D1 stock disables an out-of-stock size and re-enables it when restocked", async ({
  page,
}) => {
  try {
    // In stock in D1: Small is a selectable option. (Fixture stock is 2; we set
    // an explicit non-fixture value so the state can only have come from D1.)
    setOnHand(RED_BLANK, 7);
    await openProductOneRed(page);
    await waitForStockLoaded(page);
    await expect(sizeRadio(page, "Small")).toBeEnabled();

    // Sell it out in D1: on the next mount the same Small option is disabled,
    // while another in-stock size (Medium, blank5) stays selectable.
    setOnHand(RED_BLANK, 0);
    await page.reload();
    await waitForStockLoaded(page);
    await expect(sizeRadio(page, "Small")).toBeDisabled();
    await expect(sizeRadio(page, "Medium")).toBeEnabled();

    // Restock in D1: the option comes back, proving the snapshot is the live read
    // and nothing is cached from the fixture.
    setOnHand(RED_BLANK, 4);
    await page.reload();
    await waitForStockLoaded(page);
    await expect(sizeRadio(page, "Small")).toBeEnabled();
  } finally {
    // Leave Red's Small back at its fixture count for any re-run/other spec.
    setOnHand(RED_BLANK, 2);
  }
});
