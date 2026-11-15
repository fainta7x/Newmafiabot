import { expect, test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

// Owner, 2026-11-15: the «Игры» tab of an evening — one summary line, the evening seating folded once a game exists.
const VIEWPORTS = [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]];

for (const [width, height] of VIEWPORTS) {
  test(`evening games tab at ${width}x${height}`, async ({ page }, info) => {
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
    await page.goto('/e2e/crm-evening-games.html?games=0');
    await expect(page.getByText('Рассадка на вечер').first()).toBeVisible();
    await expect(page.getByTestId('evening-seating-folded')).toHaveCount(0);
    await check('no-games');
    await page.goto('/e2e/crm-evening-games.html');
    await expect(page.getByTestId('evening-games-summary')).toContainText('Игр: 2');
    await expect(page.getByTestId('evening-seating-folded')).not.toHaveAttribute('open', '');
    // Extras of a game fold into one line; the judge is called «Судья» (owner, 2026-11-15).
    await expect(page.getByTestId('game-extras-2')).not.toHaveAttribute('open', '');
    await expect(page.getByText('Судья: Ольга').first()).toBeVisible();
    await check('with-games');
    await page.getByTestId('game-extras-2').locator('summary').click();
    await check('extras-open');
    await page.getByTestId('evening-seating-folded').locator('summary').click();
    await check('seating-open');
    if (process.env.LIVE_TEXT_AUDIT_REPORT) console.log(`\n=== ${width}x${height} ===\n${report.join('\n') || 'clean'}`);
    expect(report).toEqual([]);
  });
}
