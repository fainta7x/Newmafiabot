import { test, expect } from '@playwright/test';

// The judge's «Вскрытие» panel on a phone: it fits the screen, every control is a touch target, the flow works.
for (const width of [360, 390]) test(`reveal panel fits and works at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/e2e/live-reveal.html');
  const panel = page.getByTestId('live-reveal-panel');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(800 + 0.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The real Don is shown to the judge next to the revealed seat, the announced checks are listed with a colour.
  await expect(page.getByTestId('live-reveal-card-5')).toContainText('на самом деле Дон');
  await expect(page.getByTestId('live-reveal-card-5')).toContainText('красный');
  await expect(page.getByTestId('live-reveal-card-5')).toContainText('чёрный');
  // Add a second reveal and an announced check.
  await page.getByTestId('live-reveal-seat-3').click();
  await expect(page.getByTestId('live-reveal-card-3')).toBeVisible();
  await page.getByLabel('Кого проверил 3').selectOption('7');
  await page.getByTestId('live-reveal-black-3').click();
  await expect(page.getByTestId('live-reveal-card-3')).toContainText('#7 Маша');
  const heights = await panel.locator('button:visible,select:visible').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  expect(heights.every((height) => height >= 43.5)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`reveal-panel-${width}.png`) });
});
