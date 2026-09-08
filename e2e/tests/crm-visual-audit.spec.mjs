import { test, expect } from '@playwright/test';

for (const width of [360, 390]) {
  test(`captures the complete CRM audit surface at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 360 ? 640 : 713 });

    const capture = async (route, name) => {
      await page.goto(`/e2e/${route}.html`);
      await expect(page.locator('.crm-premium')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}-${width}.png`), fullPage: true });
    };

    await capture('crm-overview', 'crm-today');
    await expect(page.getByText('Готовим следующую десятку', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Кандидаты на следующую игру', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Действия сегодня')).toBeVisible();

    await capture('crm-evenings', 'crm-events');
    await expect(page.getByRole('combobox', { name: 'Формат вечеров' })).toHaveCount(0);
    await page.getByRole('button', { name: /Все форматы/ }).click();
    await expect(page.getByRole('combobox', { name: 'Формат вечеров' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`crm-events-filters-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Календарь', exact: true }).click();
    await page.screenshot({ path: info.outputPath(`crm-events-calendar-${width}.png`), fullPage: true });

    await capture('crm-evening-roster', 'crm-evening-roster');
    await capture('crm-players', 'crm-players');
    await page.getByRole('button', { name: /Аватар: Пристань/ }).click();
    await expect(page.getByTestId('crm-player-next')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`crm-player-card-${width}.png`), fullPage: true });

    await capture('crm-more', 'crm-more');
    await expect(page.getByTestId('crm-more-telegram')).toHaveCount(0);
    await page.getByRole('button', { name: /Администрирование и настройки/ }).click();
    await expect(page.getByTestId('crm-more-telegram')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`crm-more-admin-${width}.png`), fullPage: true });

    await capture('crm-closeout', 'crm-closeout');
    await expect(page.getByRole('button', { name: 'Обновить закрытие вечера' })).toHaveCSS('height', '44px');
    await expect(page.getByLabel('Чек-лист закрытия')).toBeVisible();
    await expect(page.getByTestId('evening-closeout-action')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
