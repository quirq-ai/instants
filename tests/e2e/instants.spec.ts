import { test, expect, type Page } from "@playwright/test";

// UI behavior must not depend on third-party photo or font servers being online.
test.beforeEach(async ({ page }) => {
  await page.route(
    /https:\/\/(images\.unsplash\.com|fonts\.(googleapis|gstatic)\.com)/,
    (route) => route.abort(),
  );
});
const dock = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name, exact: true });

test("mobile glass dock, quick responses, and persisted theme", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page).toHaveTitle("Instants");
  await expect(page.locator('.mobile-brand img[alt="quirq"]')).toBeVisible();
  await expect(page.locator(".mobile-nav button")).toHaveCount(5);
  const glass = await page.locator(".mobile-nav").evaluate((el) => ({
    blur: getComputedStyle(el).backdropFilter,
    x: el.getBoundingClientRect().x,
  }));
  expect(glass.blur).toContain("blur(24px)");
  expect(glass.x).toBe(16);
  const post = page.locator(".post-card").first();
  await post.getByRole("button", { name: "I'm in", exact: true }).click();
  await post
    .getByRole("button", { name: "View comments", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "I'm in", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Next time", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    post.getByRole("button", { name: "Next time", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .locator(".mobile-header")
    .getByRole("button", { name: "Switch appearance" })
    .click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  for (const width of [320, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("navigation restores the feed and repeated Home returns to the top", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".post-card").first()).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(900);
  await dock(page, "Search").click();
  await expect(
    page.getByRole("heading", { name: "Explore", exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await dock(page, "Home").click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(900);
  await dock(page, "Home").click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test("carousel mouse drag, keyboard navigation, and double-click liking", async ({
  page,
}) => {
  await page.goto("/");
  const first = page.locator(".post-card").first();
  const track = first.locator(".motion-carousel-track");
  await track.scrollIntoViewIfNeeded();
  const box = (await track.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.8, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + 100, { steps: 12 });
  await page.mouse.up();
  await expect(first.locator(".slide-count")).toHaveText("2/3");
  await track.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(first.locator(".slide-count")).toHaveText("1/3");
  await track.dblclick();
  await expect(
    first.getByRole("button", { name: "Unlike post", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("story hold pauses, swipe advances, and swipe down dismisses", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".story:not(.your-story)").first().click();
  const frame = page.locator(".story-frame");
  await expect(frame).toBeVisible();
  const beforeTitle = await page
    .getByRole("dialog")
    .getAttribute("aria-labelledby");
  const firstName = await page.locator(".story-header strong").innerText();
  const box = (await frame.boundingBox())!;
  const x = box.x + box.width * 0.75,
    y = box.y + box.height * 0.45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(240); // hold activation is 180ms
  const progress = await page
    .locator(".story-progress span")
    .getAttribute("style");
  await page.waitForTimeout(270);
  expect(await page.locator(".story-progress span").getAttribute("style")).toBe(
    progress,
  );
  await page.mouse.move(x - 180, y, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".story-header strong")).not.toHaveText(firstName);
  expect(beforeTitle).toBeTruthy();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 140, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("motion lab controls, focus return, and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/motion");
  await expect(
    page.getByRole("heading", { name: "Made to feel natural." }),
  ).toBeVisible();
  await expect(page.getByText("Reduced motion is on")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Scroll preview", exact: true })
    .click();
  await expect
    .poll(() =>
      page.locator(".motion-lab-phone-scroll").evaluate((el) => el.scrollTop),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Preview Profile dock state" })
    .click();
  await expect(
    page.getByRole("button", { name: "Preview Profile dock state" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    parseFloat(
      await page
        .locator(".motion-lab-dock-indicator")
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ),
  ).toBeLessThanOrEqual(0.001);
  const open = page.getByRole("button", { name: "Open dialog" });
  await open.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await page.getByRole("button", { name: "Open sheet" }).click();
  await page
    .getByRole("button", { name: "Close friends Your inner circle" })
    .click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".motion-lab-saved-choice")).toHaveText(
    "Close friends",
  );
});

test("native touch swipe and double tap work in the feed", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.route(
    /https:\/\/(images\.unsplash\.com|fonts\.(googleapis|gstatic)\.com)/,
    (route) => route.abort(),
  );
  await page.goto(process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5180");
  const first = page.locator(".post-card").first();
  const track = first.locator(".motion-carousel-track");
  await track.scrollIntoViewIfNeeded();
  const box = (await track.boundingBox())!;
  const client = await context.newCDPSession(page);
  // Start above the Next button's expanded touch target.
  const y = box.y + box.height * 0.3;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + box.width - 40, y }],
  });
  for (let step = 1; step <= 12; step++) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: box.x + box.width - 40 - step * 24, y }],
    });
    await page.waitForTimeout(16);
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(first.locator(".slide-count")).toHaveText("2/3");
  await page.touchscreen.tap(box.x + 120, y);
  await page.touchscreen.tap(box.x + 120, y);
  await expect(
    first.getByRole("button", { name: "Unlike post", exact: true }),
  ).toBeVisible();
  await context.close();
});
