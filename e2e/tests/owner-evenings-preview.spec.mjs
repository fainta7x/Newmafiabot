import { test, expect } from '@playwright/test';

for (const width of [360, 390]) {
  test(`owner evening tracker and response picker at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 713 });
    for (const screen of ['today', 'events', 'answers']) {
      for (const before of [true, false]) {
        await page.goto(`/e2e/owner-evenings.html?screen=${screen}${before ? '&before=1' : ''}`);
        if (screen === 'answers') {
          await page.getByRole('button', { name: /Все$/ }).click();
          const row = page.getByTestId('evening-answer-row-p1');
          await row.getByRole('button', { name: /^Ответ/ }).click();
          await expect(row.getByRole('button', { name: 'Иду' })).toBeVisible();
          if (!before) {
            await expect(page.getByRole('button', { name: /Нужен ответ/ })).toHaveCount(0);
            const targets = await row.getByRole('button').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
            expect(targets.every((height) => height >= 44)).toBe(true);
          }
        } else {
          await expect(page.getByTestId('crm-week-event')).toHaveCount(4);
          if (!before) {
            await expect(page.getByText('Идут 8 из 9')).toBeVisible();
            await expect(page.getByText('Идут 11 из 11')).toBeVisible();
            const titles = await page.getByTestId('crm-week-event').locator('strong').first().textContent();
            expect(titles).toBe('Вечер для новичков');
          }
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: info.outputPath(`${screen}-${before ? 'before' : 'after'}-${width}.png`), fullPage: true });
      }
    }
    // Exercise the real response writer, not only the look of the expanded form.
    await page.getByTestId('evening-answer-row-p1').getByRole('button', { name: 'Иду' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-saved-response', 'going');
    await expect(page.getByTestId('evening-answer-row-p1').getByRole('button', { name: 'Иду' })).toHaveCount(0);
  });
}
