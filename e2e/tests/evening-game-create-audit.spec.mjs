import { expect, test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

// «Одно окно» (owner, 2026-11-02): new-game sheet with «Записаны, приход не отмечен» → «Пришёл · за стол».
const VIEWPORTS = [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]];

for (const [width, height] of VIEWPORTS) {
  test(`evening game create at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const report = [];
    let shot = 0;
    const check = async (screen) => {
      await page.waitForTimeout(250);
      const found = await page.evaluate(auditScreen);
      shot += 1;
      await page.screenshot({ path: info.outputPath(`${String(shot).padStart(2, '0')}-${screen}.png`) });
      for (const issue of found) report.push(`${screen}: ${issue}`);
    };
    await page.goto('/e2e/crm-evening-game-create.html');
    // The planned game's seating and the evening judge are filled without a click (owner, 2026-11-15).
    await expect(page.getByTestId('game-judge-name')).toHaveText('Ольга');
    await expect(page.getByTestId('planned-slot-select')).toHaveValue('s1');
    await check('opened');
    await page.getByTestId('change-judge').click();
    await expect(page.getByRole('dialog', { name: 'Судья игры' })).toBeVisible();
    await check('judge-window');
    await expect(page.getByRole('dialog', { name: 'Судья игры' }).locator('select')).toHaveValue('judge-1');
    // Only people of this evening can be chosen (owner, 2026-11-16).
    await expect(page.getByRole('dialog', { name: 'Судья игры' }).locator('option', { hasText: 'Чужой судья' })).toHaveCount(0);
    await page.getByTestId('judge-picker-done').click();
    await expect(page.getByTestId('awaiting-arrival')).toBeVisible();
    await check('before-arrival');
    await page.getByTestId('awaiting-arrival').scrollIntoViewIfNeeded();
    await check('awaiting-list');
    await page.getByTestId('arrive-and-seat-ep-8').click();
    await expect(page.getByTestId('arrive-and-seat-ep-8')).toHaveCount(0);
    await expect(page.getByTestId('game-seat-9')).toContainText('Крот');
    await check('after-arrival');
    if (process.env.LIVE_TEXT_AUDIT_REPORT) console.log(`\n=== ${width}x${height} ===\n${report.join('\n') || 'clean'}`);
    expect(report).toEqual([]);
  });
}
