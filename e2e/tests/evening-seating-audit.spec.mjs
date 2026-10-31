import { expect, test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

// «Рассадка на вечер» (owner, 2026-10-31): a chip per game, a card per table with seat tiles, a sheet to pick a player.
const VIEWPORTS = [[360, 640], [390, 844], [1366, 768], [1440, 900]];

for (const [width, height] of VIEWPORTS) {
  test(`evening seating at ${width}x${height}`, async ({ page }, info) => {
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
    await page.goto('/e2e/crm-evening-seating.html');
    await expect(page.getByTestId('seating-seat-t1-1')).toBeVisible();
    await check('table');
    await page.getByTestId('seating-seat-t1-8').click();
    await expect(page.getByTestId('seating-pick-p7')).toBeVisible();
    await expect(page.getByTestId('seating-pick-p10')).toBeVisible();
    await check('pick-player');
    await page.getByTestId('seating-pick-p7').click();
    await expect(page.getByTestId('seating-seat-t1-8')).toContainText('Солнце');
    await page.getByTestId('seating-seat-t1-8').click();
    await check('filled-seat');
    await page.getByTestId('seating-remove').click();
    await expect(page.getByTestId('seating-seat-t1-8')).toContainText('Свободно');
    if (process.env.LIVE_TEXT_AUDIT_REPORT) console.log(`\n=== ${width}x${height} ===\n${report.join('\n') || 'clean'}`);
    expect(report).toEqual([]);
  });
}
