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
          await expect(row.getByRole('button', { name: 'Иду', exact: true })).toBeVisible();
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
            expect(titles).toBe('Пятничный клубный вечер');
          }
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const screenshotPath = info.outputPath(`${screen}-${before ? 'before' : 'after'}-${width}.png`);
        if (screen === 'answers') await page.getByTestId('evening-answer-row-p1').screenshot({ path: screenshotPath });
        else await page.screenshot({ path: screenshotPath, fullPage: true });
      }
    }
    // Exercise the real response writer, not only the look of the expanded form.
    await page.getByTestId('evening-answer-row-p1').getByRole('button', { name: 'Иду', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-saved-response', 'going');
    await expect(page.getByTestId('evening-answer-row-p1').getByRole('button', { name: 'Иду', exact: true })).toHaveCount(0);
  });
}

for (const width of [390, 1280]) {
  test(`answers search field does not overlap the icon at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/e2e/owner-evenings.html?screen=answers${width > 600 ? '&wide=1' : ''}`);
    await page.evaluate(() => document.fonts.ready);
    const input = page.getByTestId('responses-player-search');
    await expect(input).toBeVisible();
    const positions = await input.evaluate((field) => {
      const icon = field.parentElement.querySelector('svg');
      const box = field.getBoundingClientRect();
      const iconBox = icon.getBoundingClientRect();
      return { textStart: box.left + parseFloat(getComputedStyle(field).paddingLeft), iconRight: iconBox.right,
        viewportWidth: document.documentElement.clientWidth, contentWidth: document.documentElement.scrollWidth };
    });
    expect(positions.textStart - positions.iconRight).toBeGreaterThanOrEqual(8);
    expect(positions.contentWidth).toBeLessThanOrEqual(positions.viewportWidth + 1);
    await input.fill('Пристань');
    await expect(input).toHaveValue('Пристань');
    const screenshotPath = info.outputPath(`responses-search-${width}.png`);
    await input.locator('xpath=..').screenshot({ path: screenshotPath });
    await info.attach(`responses-search-${width}`, { path: screenshotPath, contentType: 'image/png' });
  });
}
