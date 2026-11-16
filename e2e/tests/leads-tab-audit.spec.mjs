import { expect, test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

// Owner, 2026-11-16: the «Лиды» tab of «Игроки», the «Новый лид» form and a lead's menu at every audit size.
const VIEWPORTS = [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]];

for (const [width, height] of VIEWPORTS) {
  test(`leads tab at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const report = [];
    let shot = 0;
    const check = async (screen) => {
      await page.waitForTimeout(300);
      const found = await page.evaluate(auditScreen);
      shot += 1;
      await page.screenshot({ path: info.outputPath(`${String(shot).padStart(2, '0')}-${screen}.png`) });
      for (const issue of found) report.push(`${screen}: ${issue}`);
    };
    await page.goto('/e2e/crm-players.html');
    await page.getByRole('button', { name: 'Лиды', exact: true }).click();
    await expect(page.getByTestId('crm-leads')).toBeVisible();
    await expect(page.getByText('Марина Длиннофамильная')).toBeVisible();
    await expect(page.getByTestId('crm-lead-convert-oleg')).toBeVisible();
    await check('leads');
    await page.getByRole('tab', { name: /Позвать снова/ }).click();
    await expect(page.getByText('Позвали снова: 1 из 2')).toBeVisible();
    await check('leads-recall');
    await page.getByRole('tab', { name: /Активные/ }).click();
    await page.getByTestId('crm-lead-add').click();
    await page.getByTestId('crm-lead-name').fill('Пётр');
    await page.getByTestId('crm-lead-contact').fill('vk.com/petr_m');
    await expect(page.getByText('ВК', { exact: true }).first()).toBeVisible();
    await check('lead-form');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Ещё: Иван' }).click().catch(async () => { await page.locator('[aria-label="Ещё: Иван"]').click(); });
    await check('lead-menu');
    if (process.env.LIVE_TEXT_AUDIT_REPORT) console.log(`\n=== ${width}x${height} ===\n${report.join('\n') || 'clean'}`);
    expect(report).toEqual([]);
  });
}
