import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

for (const [width, height] of [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]]) {
  test(`CRM home: birthdays and the folded «Дела» at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto('/e2e/crm-overview.html?home=1');
    const card = page.getByTestId('crm-month-birthdays');
    await expect(card).toContainText('Ближайшие дни рождения');
    await expect(card).toContainText('сегодня');
    await expect(card).toContainText('через 10 дн.');
    await expect(card).toContainText('12 декабря');
    // «Дела» is folded: only the header with the count and the hint
    const toggle = page.getByTestId('agenda-toggle');
    await expect(toggle).toContainText('Срочно: 1');
    await expect(page.getByText('Вечер прошёл, но не закрыт')).toHaveCount(0);
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`home-folded-${width}.png`), fullPage: true });
    await toggle.click();
    await expect(page.getByText('Вечер прошёл, но не закрыт')).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
  });
}
