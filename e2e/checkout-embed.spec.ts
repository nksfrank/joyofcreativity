import { execSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

/**
 * The second authoritative checkpoint reaches the UI (#65): a validated cart is
 * paid for through Stripe's **embedded** Checkout. This spec drives the flow up to
 * the embed-mount boundary — a `client_secret` is obtained from
 * `createCheckoutSession` and the embed container mounts — but does not automate
 * the payment inside Stripe's iframe (out of scope; the return page is #53).
 *
 * Opt-in: mounting the embed needs real Stripe **test** keys the dev server can
 * read — `STRIPE_SECRET_KEY` (server, `.dev.vars`) and
 * `PUBLIC_STRIPE_PUBLISHABLE_KEY` (client, `.env`). Without them the
 * `createCheckoutSession` Action 500s and Stripe.js cannot load, so the spec is
 * skipped unless `E2E_STRIPE=1` signals a configured environment.
 *
 * This spec owns product 1's **Blue** colour (blank7–9). No other e2e spec visits
 * Blue — checkout-validation owns Green, live-stock owns Red, the configurator
 * journeys land on Cream — so touching Blue's stock can't perturb them under
 * parallelism. Blue Large is `blank9`.
 */
const BLUE_LARGE = "blank9";

/** Set a Blank's on-hand directly in the local D1 the dev server reads. */
function setOnHand(blankId: string, onHand: number): void {
  execSync(
    `npx wrangler d1 execute joyofcreativity --local --command "UPDATE stock SET on_hand = ${onHand} WHERE blank_id = '${blankId}'"`,
    { stdio: "ignore" },
  );
}

async function waitForStockLoaded(page: Page): Promise<void> {
  await expect(page.getByText("Loading availability…")).toHaveCount(0, {
    timeout: 30_000,
  });
}

/** Browse to product 1's Blue product page. */
async function openProductOneBlue(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Sweaters" }).click();
  await expect(page.getByRole("heading", { name: "Sweaters" })).toBeVisible();

  const cards = page.getByTestId("product-card");
  await expect(cards.first()).toBeVisible();

  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const variants = cards.nth(i).getByTestId("product-card-variants");
    if ((await variants.getByRole("link", { name: "Blue" }).count()) > 0) {
      await variants.getByRole("link", { name: "Blue" }).click();
      await page.waitForLoadState("networkidle");
      return;
    }
  }
  throw new Error("No product card offering Blue to reach");
}

async function checkHydrated(page: Page, group: string, name: string) {
  const option = page
    .getByRole("group", { name: group })
    .getByRole("radio", { name });
  await expect(async () => {
    await option.check();
    await expect(option).toBeChecked();
  }).toPass({ timeout: 5000 });
}

test("validated cart mounts Stripe's embedded checkout", async ({ page }) => {
  try {
    setOnHand(BLUE_LARGE, 6);
    await openProductOneBlue(page);
    await waitForStockLoaded(page);

    await checkHydrated(page, "Size", "Large");
    await checkHydrated(page, "Pattern", "Plain");
    // Plain needs one yarn colour; pick the first real option.
    const yarn = page
      .getByRole("group", { name: "Yarn Colours" })
      .getByRole("combobox")
      .first();
    const firstColour = yarn.getByRole("option").nth(1);
    const value = await firstColour.getAttribute("value");
    if (!value) throw new Error("expected a yarn colour");
    await expect(async () => {
      await yarn.selectOption(value);
      await expect(yarn).toHaveValue(value);
    }).toPass({ timeout: 5000 });

    const addButton = page.getByRole("button", { name: "Add to cart" });
    await expect(addButton).toBeEnabled();
    await addButton.click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    await page.getByTestId("cart-link").click();
    await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();

    // Validate (first checkpoint), then opt into payment (second checkpoint).
    await page.getByTestId("checkout-validate").click();
    await expect(page.getByTestId("checkout-ready")).toBeVisible();
    await page.getByTestId("checkout-pay").click();

    // The embed-mount boundary: the container appears and Stripe.js mounts its
    // iframe into it once a client_secret is obtained. The payment itself is not
    // automated.
    const embed = page.getByTestId("checkout-embed");
    await expect(embed).toBeVisible();
    await expect(embed.locator("iframe")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("checkout-embed-error")).toHaveCount(0);
  } finally {
    setOnHand(BLUE_LARGE, 4);
  }
});
