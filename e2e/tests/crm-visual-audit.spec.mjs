import { test, expect } from '@playwright/test';

test('captures the complete premium CRM surface on a phone', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 713 });

  const capture = async (route, name) => {
    await page.goto(`/e2e/${route}.html`);
    await expect(page.locator('.crm-premium')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  };

  await capture('crm-overview', 'crm-today');
  await expect(page.getByText('Готовим следующую десятку', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Кандидаты на следующую игру', { exact: true })).toHaveCount(0);
  await capture('crm-evenings', 'crm-events');
  await page.getByRole('button', { name: 'Календарь', exact: true }).click();
  await page.screenshot({ path: info.outputPath('crm-events-calendar.png'), fullPage: true });

  await capture('crm-evening-roster', 'crm-evening-roster');
  await capture('crm-players', 'crm-players');
  await page.getByRole('button', { name: /Аватар: Пристань/ }).click();
  await expect(page.getByTestId('crm-player-next')).toBeVisible();
  await page.screenshot({ path: info.outputPath('crm-player-card.png'), fullPage: true });

  await capture('crm-more', 'crm-more');
  await capture('crm-closeout', 'crm-closeout');
  await expect(page.getByRole('button', { name: 'Обновить закрытие вечера' })).toHaveCSS('height', '44px');
});
