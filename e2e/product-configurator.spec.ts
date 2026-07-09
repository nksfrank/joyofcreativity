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

async function selectHydrated(select: Locator, value: string): Promise<void> {
  await expect(async () => {
    await select.selectOption(value);
    await expect(select).toHaveValue(value);
  }).toPass({ timeout: 5000 });
}

/**
 * Yarn is one required <select> per field (ADR-0009). Picks the first real
 * colour in each field (option index 1, past the empty placeholder), which is
 * deterministic so an identical re-configuration merges to the same cart line.
 * Returns the chosen colour names in field order.
 */
async function chooseYarns(page: Page): Promise<string[]> {
  const selects = page
    .getByRole("group", { name: "Yarn Colours" })
    .getByRole("combobox");
  const count = await selects.count();
  const chosen: string[] = [];
  for (let i = 0; i < count; i++) {
    const select = selects.nth(i);
    const firstColour = select.getByRole("option").nth(1);
    const value = await firstColour.getAttribute("value");
    if (!value) throw new Error("Expected a yarn colour option");
    chosen.push((await firstColour.innerText()).trim());
    await selectHydrated(select, value);
  }
  return chosen;
}

/** The available yarn option values of a field, excluding the empty placeholder. */
async function availableYarnValues(page: Page): Promise<string[]> {
  const options = page
    .getByRole("group", { name: "Yarn Colours" })
    .getByRole("combobox")
    .first()
    .getByRole("option");
  const count = await options.count();
  const values: string[] = [];
  for (let i = 0; i < count; i++) {
    const value = await options.nth(i).getAttribute("value");
    if (value) values.push(value);
  }
  return values;
}

/** Sets each required yarn field (by index) to the given option value. */
async function fillYarnFields(page: Page, values: string[]): Promise<void> {
  const selects = page
    .getByRole("group", { name: "Yarn Colours" })
    .getByRole("combobox");
  for (const [index, value] of values.entries()) {
    await selectHydrated(selects.nth(index), value);
  }
}

/** Browses from the start page to the Sweaters listing and returns its product cards. */
async function openSweatersListing(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.getByRole("link", { name: "Sweaters" }).click();
  await expect(page.getByRole("heading", { name: "Sweaters" })).toBeVisible();

  const cards = page.getByTestId("product-card");
  await expect(cards.first()).toBeVisible();
  return cards;
}

/** The first product card whose number of offered colours satisfies `matches`. */
async function findCardByColourCount(
  cards: Locator,
  matches: (count: number) => boolean,
): Promise<Locator> {
  const cardCount = await cards.count();
  for (let i = 0; i < cardCount; i++) {
    const candidate = cards.nth(i);
    const links = candidate
      .getByTestId("product-card-variants")
      .getByRole("link");
    if (matches(await links.count())) {
      return candidate;
    }
  }
  throw new Error("No product card matched the requested colour count");
}

/**
 * Browses to the listing and clicks the first colour variant link on the first
 * card offering more than one. Returns the family title and the colour name
 * clicked, so the caller can assert against the product page it lands on.
 */
async function goToFirstVariantProductPage(
  page: Page,
): Promise<{ cardTitle: string; colourName: string }> {
  const cards = await openSweatersListing(page);
  const variantCard = await findCardByColourCount(cards, (count) => count > 1);

  const cardTitle = await variantCard
    .getByTestId("product-card-title")
    .innerText();
  const variantLink = variantCard
    .getByTestId("product-card-variants")
    .getByRole("link")
    .first();
  const colourName = (await variantLink.innerText()).trim();

  await variantLink.click();
  await page.waitForLoadState("networkidle");

  return { cardTitle, colourName };
}

/**
 * Picks the first enabled size, pattern, and yarn, fills the custom text, and
 * adds the configuration to the cart. Returns what was chosen so the caller can
 * assert it against the cart line.
 */
async function configureAndAddToCart(page: Page): Promise<{
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

  const yarn = (await chooseYarns(page)).join(", ");

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

test("a single-colour family shows the colour but renders no switcher", async ({
  page,
}) => {
  const cards = await openSweatersListing(page);
  const singleCard = await findCardByColourCount(cards, (count) => count === 1);

  const cardTitle = await singleCard.getByTestId("product-card-title").innerText();
  const variantLink = singleCard
    .getByTestId("product-card-variants")
    .getByRole("link");
  const colourName = (await variantLink.innerText()).trim();
  await variantLink.click();
  await page.waitForLoadState("networkidle");

  // Sole colour (ADR-0010): there is nowhere to switch to, so no switcher renders.
  await expect(page.getByRole("navigation", { name: "Colour" })).toHaveCount(0);
  await expect(page.getByTestId("colour-option")).toHaveCount(0);

  // ...but the sole colour is still shown in the product info,
  await expect(page.getByTestId("product-colour")).toContainText(colourName);

  // ...and carries through to the cart line after add-to-cart.
  await configureAndAddToCart(page);
  await page.getByTestId("cart-link").click();
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();

  const line = page.getByTestId("cart-line-item");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText(cardTitle);
  await expect(line).toContainText(colourName);
});

// Drives yarn via the required <select> fields introduced in ADR-0009 (the old
// checkbox journey retired with the exact-count rule).
test("configure a product, add it to the cart, and add it again to reach quantity 2", async ({
  page,
}) => {
  const { cardTitle, colourName } = await goToFirstVariantProductPage(page);
  const productUrl = page.url();

  // Impossible options are genuinely disabled (disable-only UX).
  await expect(
    page.getByRole("group", { name: "Size" }).getByRole("radio", { disabled: true }),
  ).not.toHaveCount(0);

  const config = await configureAndAddToCart(page);

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
  const again = await configureAndAddToCart(page);
  expect(again).toEqual(config);

  await page.getByTestId("cart-link").click();
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();

  const mergedLine = page.getByTestId("cart-line-item");
  await expect(mergedLine).toHaveCount(1);
  await expect(mergedLine.getByTestId("cart-line-item-quantity")).toHaveText("2");
});

test("a fully single-option product is priced and add-to-cart-ready on load", async ({
  page,
}) => {
  const cards = await openSweatersListing(page);
  const card = cards.filter({ hasText: "Midnight Sweater" });
  await expect(card).toHaveCount(1);

  await card.getByTestId("product-card-variants").getByRole("link").click();
  await page.waitForLoadState("networkidle");

  // Every required attribute is structurally single (one colour, one size, one
  // pattern, one available yarn), so the model pre-fills them: a price resolves
  // and Add to cart is enabled with no manual selection.
  const priceLocator = page.getByTestId("product-price");
  await expect(priceLocator).not.toHaveText("Select a size and pattern");
  const addButton = page.getByRole("button", { name: "Add to cart" });
  await expect(addButton).toBeEnabled();

  // The auto-selected size, pattern, and yarn carry through to the cart line.
  await addButton.click();
  await page.getByTestId("cart-link").click();
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();

  const line = page.getByTestId("cart-line-item");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("Midnight Sweater");
  await expect(line).toContainText("Black");
  await expect(line).toContainText("Medium");
  await expect(line).toContainText("Plain");
  await expect(line).toContainText("Charcoal");
});

test("yarn is an order-insensitive multiset: reorder merges, different multiset splits", async ({
  page,
}) => {
  await goToFirstVariantProductPage(page);
  const productUrl = page.url();

  // Signature Letter needs three yarn colours — enough fields to reorder and to
  // duplicate — and stays a fixed size+pattern across adds so only the yarn
  // multiset varies.
  const selectSizeAndSignature = async () => {
    const sizeRadio = await firstEnabledOption(
      page.getByRole("group", { name: "Size" }).getByRole("radio"),
    );
    if (!sizeRadio) throw new Error("Expected an enabled size option");
    await checkHydrated(sizeRadio);
    await checkHydrated(
      page
        .getByRole("group", { name: "Pattern" })
        .getByRole("radio", { name: "Signature Letter" }),
    );
  };

  const addYarn = async (values: string[]) => {
    await fillYarnFields(page, values);
    const addButton = page.getByRole("button", { name: "Add to cart" });
    await expect(addButton).toBeEnabled();
    await addButton.click();
  };

  const reconfigure = async (values: string[]) => {
    await page.goto(productUrl);
    await page.waitForLoadState("networkidle");
    await selectSizeAndSignature();
    await addYarn(values);
  };

  await selectSizeAndSignature();
  const [a, b] = await availableYarnValues(page);
  if (!a || !b) throw new Error("Expected at least two available yarn colours");

  // Multiset {a, a, b}, then the same multiset in a different field order.
  await addYarn([a, b, a]);
  await reconfigure([b, a, a]);

  await page.getByTestId("cart-link").click();
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  let lines = page.getByTestId("cart-line-item");
  await expect(lines).toHaveCount(1);
  await expect(lines.getByTestId("cart-line-item-quantity")).toHaveText("2");

  // A genuinely different multiset {a, a, a} is a distinct line.
  await reconfigure([a, a, a]);
  await page.getByTestId("cart-link").click();
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  lines = page.getByTestId("cart-line-item");
  await expect(lines).toHaveCount(2);
});
