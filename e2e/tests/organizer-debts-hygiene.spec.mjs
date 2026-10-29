import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

for (const [width, height] of [[360, 640], [390, 844], [1366, 768], [1440, 900]]) {
  test(`Today debts panel, agenda legend and club hygiene at ${width}`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height });
    const check = async (name) => {
      await page.evaluate(() => document.fonts.ready);
      await expect.poll(() => page.evaluate(auditScreen), { message: name }).toEqual([]);
    };
    // Debts across several evenings: one row per player, total + each evening, one button for everything.
    await page.goto('/e2e/organizer-crm.html?debts=1');
    const panel = page.getByTestId('debts-panel');
    await panel.waitFor();
    await expect(panel).toContainText('Перец');
    await expect(panel).toContainText('Оплачено всё');
    await panel.scrollIntoViewIfNeeded();
    await check('debts-panel');
    // «Дела»: the legend explains the buttons, no duplicate «Все дела» when nothing is hidden.
    await page.goto('/e2e/organizer-crm.html?followups=1&route=/admin/tasks');
    await page.getByTestId('agenda').waitFor();
    await page.getByTestId('agenda-legend').locator('summary').click();
    await expect(page.getByTestId('agenda-legend')).toContainText('Написал');
    await check('agenda-legend');
    // «Гигиена клуба»: categories as filters, the people of the chosen one.
    await page.getByRole('tab', { name: 'Гигиена клуба' }).click();
    await expect(page.getByTestId('club-hygiene')).toContainText('Нет аватарки · 3');
    await expect(page.getByTestId('hygiene-person')).toHaveCount(3);
    await check('hygiene-avatar');
    await page.getByRole('tab', { name: /Нет дня рождения/ }).click();
    await expect(page.getByTestId('hygiene-person')).toHaveCount(1);
    await page.getByRole('tab', { name: /Дата рождения скрыта/ }).click();
    await expect(page.getByTestId('club-hygiene')).toContainText('В этой категории всё в порядке');
    await check('hygiene-empty');
  });
}
