import { execSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

/**
 * The first authoritative checkpoint reaches the UI (#64). Add-to-cart routes
 * through `validateCheckout`, so the cart line carries the *server-validated*
 * price (ADR-0016 superseding ADR-0004); and the cart summary re-runs
 * `validateCheckout` on checkout, surfacing a per-line problem when live D1 stock
 * no longer covers the line.
 *
 * This spec owns product 1's **Green** colour (blank10–12). No other e2e spec
 * visits Green — the configurator journeys land on Cream and `live-stock` owns
 * Red — so mutating Green's Large stock can't perturb them under full
 * parallelism. Green Large is `blank12`.
 */
const GREEN_LARGE = "blank12";

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

/** Browse to product 1's Green product page. */
async function openProductOneGreen(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("link", { name: "Sweaters" }).click();
  await expect(page.getByRole("heading", { name: "Sweaters" })).toBeVisible();

  const cards = page.getByTestId("product-card");
  await expect(cards.first()).toBeVisible();

  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const variants = cards.nth(i).getByTestId("product-card-variants");
    if ((await variants.getByRole("link").count()) > 1) {
      await variants.getByRole("link", { name: "Green" }).click();
      await page.waitForLoadState("networkidle");
      return;
    }
  }
  throw new Error("No multi-colour product card to reach Green from");
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

test("server-validated cart price, and out-of-stock surfaced on checkout", async ({
  page,
}) => {
  try {
    // In stock: configure Green / Large / Plain and add it. Add-to-cart goes
    // through validateCheckout, so the stored line price is the server's.
    setOnHand(GREEN_LARGE, 6);
    await openProductOneGreen(page);
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

    const priceLocator = page.getByTestId("product-price");
    await expect(priceLocator).not.toHaveText("Select a size and pattern");
    const configuredPrice = (await priceLocator.innerText()).trim();

    const addButton = page.getByRole("button", { name: "Add to cart" });
    await expect(addButton).toBeEnabled();
    await addButton.click();

    // The badge only ticks up once the server round-trip resolves and the line
    // is stored — proving the add went through validateCheckout.
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    await page.getByTestId("cart-link").click();
    await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();

    const line = page.getByTestId("cart-line-item");
    await expect(line).toHaveCount(1);
    // The stored price is the server-validated price — equal to what the
    // configurator showed, but now sourced from the server quote.
    await expect(line.getByTestId("cart-line-item-price")).toHaveText(
      configuredPrice,
    );

    // Sell it out in D1, then check out: the summary re-validates server-side and
    // surfaces the out-of-stock problem on that line.
    setOnHand(GREEN_LARGE, 0);
    await page.getByTestId("checkout-validate").click();

    const problem = line.getByTestId("cart-line-item-problem");
    await expect(problem).toBeVisible();
    await expect(problem).toContainText("Out of stock");
    await expect(page.getByTestId("checkout-blocked")).toBeVisible();
  } finally {
    // Leave Green Large back at its fixture count for any re-run/other spec.
    setOnHand(GREEN_LARGE, 3);
  }
});
