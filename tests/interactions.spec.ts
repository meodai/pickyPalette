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
  await page.mouse.move(
    box.x + box.width * from.x,
    box.y + box.height * from.y,
  );
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

async function getCanvasSignature(canvas: Locator): Promise<string> {
  return canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext("2d");
    if (!context) throw new Error("2D context not available");
    const { width, height } = target;
    const { data } = context.getImageData(0, 0, width, height);
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 64) {
      hash ^= data[index];
      hash = Math.imul(hash, 16777619);
      hash ^= data[index + 1] ?? 0;
      hash = Math.imul(hash, 16777619);
      hash ^= data[index + 2] ?? 0;
      hash = Math.imul(hash, 16777619);
      hash ^= data[index + 3] ?? 0;
      hash = Math.imul(hash, 16777619);
    }
    return `${width}x${height}:${hash >>> 0}`;
  });
}

test("Alt shows and hides the swatch mask", async ({ page }) => {
  await seedPalette(page, ["#ff0000", "#00ff00"]);

  const swatch = page.locator(".picker__swatch").first();
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

test("Alt+Shift isolates the hovered swatch instead of using the normal Alt mask", async ({
  page,
}) => {
  await seedPalette(page, ["#ff0000", "#00ff00"]);

  const swatch = page.locator(".picker__swatch").first();
  const mask = page.getByTestId("mask-canvas");

  await swatch.hover();

  await page.keyboard.down("Alt");
  await expect(mask).toBeVisible();
  const altSignature = await getCanvasSignature(mask);

  await page.keyboard.down("Shift");
  await expect
    .poll(async () => getCanvasSignature(mask))
    .not.toBe(altSignature);

  await page.keyboard.up("Shift");
  await expect.poll(async () => getCanvasSignature(mask)).toBe(altSignature);

  await page.keyboard.up("Alt");
  await expect(mask).toBeHidden();
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

  await expect
    .poll(async () => page.locator(".picker__swatch").count())
    .toBe(1);
  await expect(page.locator(".picker__swatch").first()).toBeVisible();

  await canvas.click();
  await page.keyboard.up("Control");

  await waitForPaletteCount(page, 1);
  await expect(page.locator(".picker__swatch.is-selected")).toHaveCount(1);
});

test("Alt+Shift changes the preview mask while Ctrl-previewing on the canvas", async ({
  page,
}) => {
  await seedPalette(page, ["#ff0000", "#00ff00"]);

  const canvas = page.locator("[data-canvas-wrap]");
  const mask = page.getByTestId("mask-canvas");

  await hoverCanvasCenter(canvas);
  await page.keyboard.down("Control");
  await page.keyboard.down("Alt");
  await canvas.hover({ position: { x: 70, y: 70 } });

  await expect
    .poll(async () => page.locator(".picker__swatch").count())
    .toBe(3);
  await expect(mask).toBeVisible();
  const altSignature = await getCanvasSignature(mask);

  await page.keyboard.down("Shift");
  await expect
    .poll(async () => getCanvasSignature(mask))
    .not.toBe(altSignature);

  await page.keyboard.up("Shift");
  await expect.poll(async () => getCanvasSignature(mask)).toBe(altSignature);

  await page.keyboard.up("Alt");
  await page.keyboard.up("Control");
  await expect(mask).toBeHidden();
  await expect
    .poll(async () => page.locator(".picker__swatch").count())
    .toBe(2);
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

test("invert Z stays in sync across controls and dragging still updates color", async ({
  page,
}) => {
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
  await expect
    .poll(() =>
      settingsInvert.evaluate((el) => el.classList.contains("is-active")),
    )
    .toBe(true);
  await expect
    .poll(() =>
      sliderInvert.evaluate((el) => el.classList.contains("is-active")),
    )
    .toBe(true);
  await expect(page).toHaveURL(/invertZ=1/);

  await addButton.click();
  await dragOnCanvas(page, canvas, { x: 0.18, y: 0.82 }, { x: 0.82, y: 0.18 });
  await waitForPaletteCount(page, 2);
  await expect
    .poll(() =>
      settingsInvert.evaluate((el) => el.classList.contains("is-active")),
    )
    .toBe(true);
  await expect
    .poll(() =>
      sliderInvert.evaluate((el) => el.classList.contains("is-active")),
    )
    .toBe(true);

  await sliderInvert.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect
    .poll(() =>
      settingsInvert.evaluate((el) => el.classList.contains("is-active")),
    )
    .toBe(false);
  await expect
    .poll(() =>
      sliderInvert.evaluate((el) => el.classList.contains("is-active")),
    )
    .toBe(false);
  await expect(page).not.toHaveURL(/invertZ=1/);
});
