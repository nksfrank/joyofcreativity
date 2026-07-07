import { expect, type Locator, type Page, test } from "@playwright/test";

async function firstEnabledOption(locator: Locator): Promise<Locator | null> {
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const option = locator.nth(i);
    if (await option.isEnabled()) {
      return option;
    }
  }
  return null;
}

async function firstEnabledUncheckedOption(
  locator: Locator,
): Promise<Locator | null> {
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const option = locator.nth(i);
    if ((await option.isEnabled()) && !(await option.isChecked())) {
      return option;
    }
  }
  return null;
}

async function labelText(locator: Locator): Promise<string> {
  return (await locator.locator("xpath=..").innerText()).trim();
}

/**
 * Browses from the start page through the listing and clicks the first
 * colour variant link on the first card that has more than one. Returns
 * the family title and the colour name that was clicked, so the caller can
 * assert against the product page it lands on.
 */
async function goToFirstVariantProductPage(
  page: Page,
): Promise<{ cardTitle: string; variantName: string }> {
  await page.goto("/");
  await page.getByRole("link", { name: "Products" }).click();

  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();

  const cards = page.getByTestId("product-card");
  await expect(cards.first()).toBeVisible();

  const cardCount = await cards.count();
  let variantCard = null;
  let variantLinks = null;
  for (let i = 0; i < cardCount; i++) {
    const candidate = cards.nth(i);
    const links = candidate
      .getByTestId("product-card-variants")
      .getByRole("link");
    if ((await links.count()) > 1) {
      variantCard = candidate;
      variantLinks = links;
      break;
    }
  }
  if (!variantCard || !variantLinks) {
    throw new Error(
      "Expected at least one product card with more than one colour variant",
    );
  }

  const cardTitle = await variantCard
    .getByTestId("product-card-title")
    .innerText();
  const variantLink = variantLinks.first();
  const variantName = (await variantLink.innerText()).toLowerCase();

  await variantLink.click();
  await page.waitForLoadState("networkidle");

  return { cardTitle, variantName };
}

test("browsing from the start page through the listing to a colour variant", async ({
  page,
}) => {
  const { cardTitle, variantName } = await goToFirstVariantProductPage(page);

  const pageHeading = page.getByRole("heading", { level: 1 });
  await expect(pageHeading).toBeVisible();
  await expect(pageHeading).toHaveText(cardTitle);

  const variantRadio = page.getByRole("radio", { name: variantName });
  await expect(variantRadio).toBeEnabled();
  await expect(variantRadio).toBeChecked();

  // take an unchecked enabled colour option and check it, then assert the URL updates with the new color query param
  const colourGroup = page.getByRole("group", { name: "Colour" });
  const otherVariantRadio = await firstEnabledUncheckedOption(
    colourGroup.getByRole("radio"),
  );
  if (!otherVariantRadio) {
    throw new Error("Expected at least one other enabled colour option");
  }
  const otherVariantName = (await labelText(otherVariantRadio)).toLowerCase();
  await otherVariantRadio.check();
  await expect(page).toHaveURL(
    new RegExp(`color=${encodeURIComponent(otherVariantName)}`),
  );
});

test.fixme("configuring a colour variant and checking out", async ({
  page,
}) => {
  // Pending: no product yet offers yarn colours / text customisation,
  // and there is no checkout page. See e2e-product-journey-spec-contract memory.
  const { variantName } = await goToFirstVariantProductPage(page);

  const sizeGroup = page.getByRole("group", { name: "Size" });
  const sizeRadio = await firstEnabledOption(sizeGroup.getByRole("radio"));
  if (!sizeRadio) {
    throw new Error("Expected at least one enabled size option");
  }
  const sizeName = await labelText(sizeRadio);
  await sizeRadio.check();

  const yarnGroup = page.getByRole("group", { name: "Yarn Colours" });
  const yarnCheckbox = await firstEnabledOption(
    yarnGroup.getByRole("checkbox"),
  );
  if (!yarnCheckbox) {
    throw new Error("Expected at least one enabled yarn colour option");
  }
  const yarnName = await labelText(yarnCheckbox);
  await yarnCheckbox.check();

  const customisationText = "A";
  await page
    .getByRole("textbox", { name: "Custom Text" })
    .fill(customisationText);

  const configuredPrice = await page.getByTestId("product-price").innerText();

  await page.getByRole("button", { name: "Add to cart" }).click();

  await page.getByRole("link", { name: "Checkout" }).click();

  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

  const cartLineItem = page
    .getByTestId("cart-line-item")
    .filter({ hasText: variantName });
  await expect(cartLineItem).toContainText(variantName);
  await expect(cartLineItem).toContainText(sizeName);
  await expect(cartLineItem).toContainText(yarnName);
  await expect(cartLineItem).toContainText(customisationText);
  await expect(cartLineItem.getByTestId("cart-line-item-price")).toHaveText(
    configuredPrice,
  );

  await expect(page.getByTestId("checkout-total")).toHaveText(configuredPrice);
});
