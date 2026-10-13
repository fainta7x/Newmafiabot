import { test, expect } from '@playwright/test';

for (const width of [360, 390, 1440]) {
  test(`fiery autumn preview switches surfaces at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/e2e/cosmetics.html');
    for (const [surface, label] of [['profile','Профиль'],['poker','Покер'],['broadcast','Эфир']]) {
      const button = page.getByRole('button', { name: label, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      const scene = page.getByTestId(`autumn-scene-${surface}`);
      await expect(scene).toBeVisible();
      await expect.poll(() => scene.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: testInfo.outputPath(`fiery-autumn-${surface}-${width}.png`) });
    }
    await page.getByText('Оформление', { exact: true }).click();
    await expect(page.getByTestId('autumn-scene-broadcast')).not.toBeVisible();
  });
}
