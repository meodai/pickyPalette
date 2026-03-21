import { expect, test, type Locator, type Page } from "@playwright/test";

async function waitForPaletteCount(page: Page, count: number): Promise<void> {
  await expect(page.locator(".picker__swatch")).toHaveCount(count);
}

function makePalette(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const value = (index + 1).toString(16).padStart(2, "0");
    return `#${value}${value}${value}`;
  });
}

async function hoverCanvasCenter(canvas: Locator): Promise<void> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas wrap not found");
  await canvas.hover({ position: { x: box.width / 2, y: box.height / 2 } });
}

async function dragOnCanvas(
  page: Page,
  canvas: Locator,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas wrap not found");
  await page.mouse.move(box.x + box.width * from.x, box.y + box.height * from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to.x, box.y + box.height * to.y, {
    steps: 12,
  });
  await page.mouse.up();
}

async function seedPalette(
  page: Page,
  colors: string[],
  timeout = 4000,
): Promise<void> {
  await page.goto("/");
  await page.locator("[data-paste]").evaluate((element, value) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }, colors.join(", "));
  await expect(page.locator("[data-paste]")).toHaveValue(colors.join(", "));
  await expect
    .poll(async () => page.locator(".picker__swatch").count(), {
      timeout,
    })
    .toBe(colors.length);
}

test("Alt shows and hides the swatch mask", async ({ page }) => {
  await seedPalette(page, ["#ff0000", "#00ff00"]);

  const swatch = page.locator(".picker__swatch").first();
  const selectedSwatch = page.locator(".picker__swatch.is-selected");
  const mask = page.getByTestId("mask-canvas");
  const highlight = page.getByTestId("highlight-canvas");

  await swatch.hover();
  await expect(highlight).toBeVisible();

  await page.keyboard.down("Alt");
  await expect(mask).toBeVisible();

  await page.keyboard.up("Alt");
  await expect(mask).toBeHidden();
  await expect(highlight).toBeVisible();
});

test("Control preview can be committed from the canvas", async ({ page }) => {
  await page.goto("/");
  await waitForPaletteCount(page, 0);

  const canvas = page.locator("[data-canvas-wrap]");
  const probe = page.getByTestId("cursor-probe");
  await hoverCanvasCenter(canvas);
  await expect(probe).toBeVisible();
  await page.keyboard.down("Control");
  await canvas.hover({ position: { x: 20, y: 20 } });

  await expect.poll(async () => page.locator(".picker__swatch").count()).toBe(1);
  await expect(page.locator(".picker__swatch").first()).toBeVisible();

  await canvas.click();
  await page.keyboard.up("Control");

  await waitForPaletteCount(page, 1);
  await expect(page.locator(".picker__swatch.is-selected")).toHaveCount(1);
});

test("active overlays survive viewport resize", async ({ page }) => {
  await seedPalette(page, ["#ff0000", "#00ff00"]);

  const swatch = page.locator(".picker__swatch").first();
  const highlight = page.getByTestId("highlight-canvas");
  const mask = page.getByTestId("mask-canvas");

  await swatch.hover();
  await expect(highlight).toBeVisible();

  await page.setViewportSize({ width: 980, height: 900 });
  await expect(highlight).toBeVisible();

  await page.keyboard.down("Alt");
  await expect(mask).toBeVisible();

  await page.setViewportSize({ width: 760, height: 780 });
  await expect(mask).toBeVisible();

  await page.keyboard.up("Alt");
  await expect(mask).toBeHidden();
});

test("canvas add-drags stop at the max color count", async ({ page }) => {
  await seedPalette(page, makePalette(127), 10000);

  const canvas = page.locator("[data-canvas-wrap]");
  const addButton = page.locator("[data-add]");

  await addButton.click();
  await dragOnCanvas(page, canvas, { x: 0.18, y: 0.2 }, { x: 0.26, y: 0.32 });
  await waitForPaletteCount(page, 128);

  await addButton.click();
  await dragOnCanvas(page, canvas, { x: 0.72, y: 0.72 }, { x: 0.84, y: 0.84 });
  await waitForPaletteCount(page, 128);
});

test("invert Z stays in sync across controls and dragging still updates color", async ({ page }) => {
  await seedPalette(page, ["#ff0000"]);

  const canvas = page.locator("[data-canvas-wrap]");
  const swatch = page.locator(".picker__swatch").first();
  const settingsInvert = page.locator(".picker__invert-btn");
  const sliderInvert = page.locator(".picker__slider-invert-btn");
  const addButton = page.locator("[data-add]");

  await swatch.click();

  await settingsInvert.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect.poll(() => settingsInvert.evaluate((el) => el.classList.contains("is-active"))).toBe(true);
  await expect.poll(() => sliderInvert.evaluate((el) => el.classList.contains("is-active"))).toBe(true);
  await expect(page).toHaveURL(/invertZ=1/);

  await addButton.click();
  await dragOnCanvas(page, canvas, { x: 0.18, y: 0.82 }, { x: 0.82, y: 0.18 });
  await waitForPaletteCount(page, 2);
  await expect.poll(() => settingsInvert.evaluate((el) => el.classList.contains("is-active"))).toBe(true);
  await expect.poll(() => sliderInvert.evaluate((el) => el.classList.contains("is-active"))).toBe(true);

  await sliderInvert.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect.poll(() => settingsInvert.evaluate((el) => el.classList.contains("is-active"))).toBe(false);
  await expect.poll(() => sliderInvert.evaluate((el) => el.classList.contains("is-active"))).toBe(false);
  await expect(page).not.toHaveURL(/invertZ=1/);
});