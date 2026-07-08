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

/** The visible text of the <label> wrapping this input. */
async function labelText(locator: Locator): Promise<string> {
  return (await locator.locator("xpath=ancestor::label[1]").innerText()).trim();
}

/**
 * Checks a control, retrying the whole check+assert so the interaction survives the
 * SSR→hydrate handoff (a click landing before the island hydrates would otherwise be lost).
 */
async function checkHydrated(option: Locator): Promise<void> {
  await expect(async () => {
    await option.check();
    await expect(option).toBeChecked();
  }).toPass({ timeout: 5000 });
}

async function fillHydrated(input: Locator, value: string): Promise<void> {
  await expect(async () => {
    await input.fill(value);
    await expect(input).toHaveValue(value);
  }).toPass({ timeout: 5000 });
}

/**
 * Browses from the start page through the listing and clicks the first colour
 * variant link on the first card that has more than one. Returns the family
 * title and the colour name clicked, so the caller can assert against the
 * product page it lands on.
 */
async function goToFirstVariantProductPage(
  page: Page,
): Promise<{ cardTitle: string; colourName: string }> {
  await page.goto("/");
  await page.getByRole("link", { name: "Sweaters" }).click();

  await expect(page.getByRole("heading", { name: "Sweaters" })).toBeVisible();

  const cards = page.getByTestId("product-card");
  await expect(cards.first()).toBeVisible();

  const cardCount = await cards.count();
  let variantCard: Locator | null = null;
  let variantLinks: Locator | null = null;
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
  const colourName = (await variantLink.innerText()).trim();

  await variantLink.click();
  await page.waitForLoadState("networkidle");

  return { cardTitle, colourName };
}

test("listing leads to the arrived colour's page with that colour selected", async ({
  page,
}) => {
  const { cardTitle, colourName } = await goToFirstVariantProductPage(page);

  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText(cardTitle);

  // Colour is route-driven: the arrived colour is the current page (aria-current),
  // and there is no ?color= query param.
  const current = page.locator('[data-testid="colour-option"][aria-current="true"]');
  await expect(current).toHaveText(colourName);
  expect(page.url()).not.toContain("color=");
});

test("configure a product, add it to the cart, and add it again to reach quantity 2", async ({
  page,
}) => {
  const { cardTitle, colourName } = await goToFirstVariantProductPage(page);
  const productUrl = page.url();

  // Impossible options are genuinely disabled (disable-only UX).
  await expect(
    page.getByRole("group", { name: "Size" }).getByRole("radio", { disabled: true }),
  ).not.toHaveCount(0);

  async function configure(): Promise<{
    size: string;
    pattern: string;
    yarn: string;
    text: string;
    price: string;
  }> {
    const sizeRadio = await firstEnabledOption(
      page.getByRole("group", { name: "Size" }).getByRole("radio"),
    );
    if (!sizeRadio) throw new Error("Expected an enabled size option");
    const size = await labelText(sizeRadio);
    await checkHydrated(sizeRadio);

    const patternRadio = await firstEnabledOption(
      page.getByRole("group", { name: "Pattern" }).getByRole("radio"),
    );
    if (!patternRadio) throw new Error("Expected an enabled pattern option");
    const pattern = await labelText(patternRadio);
    await checkHydrated(patternRadio);

    const yarnCheckbox = await firstEnabledOption(
      page.getByRole("group", { name: "Yarn Colours" }).getByRole("checkbox"),
    );
    if (!yarnCheckbox) throw new Error("Expected an enabled yarn option");
    const yarn = await labelText(yarnCheckbox);
    await checkHydrated(yarnCheckbox);

    const text = "AB";
    await fillHydrated(page.getByRole("textbox", { name: "Custom Text" }), text);

    // The price resolves to a configured value once size and pattern are chosen.
    const priceLocator = page.getByTestId("product-price");
    await expect(priceLocator).not.toHaveText("Select a size and pattern");
    const price = (await priceLocator.innerText()).trim();

    const addButton = page.getByRole("button", { name: "Add to cart" });
    await expect(addButton).toBeEnabled();
    await addButton.click();

    return { size, pattern, yarn, text, price };
  }

  const config = await configure();

  // The layout cart badge reflects the added item from any page.
  await expect(page.getByTestId("cart-count")).toHaveText("1");

  await page.getByTestId("cart-link").click();
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();

  const line = page.getByTestId("cart-line-item");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText(cardTitle);
  await expect(line).toContainText(colourName);
  await expect(line).toContainText(config.size);
  await expect(line).toContainText(config.pattern);
  await expect(line).toContainText(config.yarn);
  await expect(line).toContainText(config.text);
  await expect(line.getByTestId("cart-line-item-quantity")).toHaveText("1");
  await expect(line.getByTestId("cart-line-item-price")).toHaveText(config.price);
  await expect(page.getByTestId("cart-total")).toHaveText(config.price);

  // Add the identical configuration again: the line's quantity increments, no new line.
  await page.goto(productUrl);
  await page.waitForLoadState("networkidle");
  const again = await configure();
  expect(again).toEqual(config);

  await page.getByTestId("cart-link").click();
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();

  const mergedLine = page.getByTestId("cart-line-item");
  await expect(mergedLine).toHaveCount(1);
  await expect(mergedLine.getByTestId("cart-line-item-quantity")).toHaveText("2");
});
