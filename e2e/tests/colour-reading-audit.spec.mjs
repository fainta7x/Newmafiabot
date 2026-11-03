import { expect, test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

// «Читать цвет» in «Обучение» (owner, 2026-11-03): every tab at the five audit sizes.
const VIEWPORTS = [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]];
const TABS = ['mine', 'me', 'mafia', 'don'];

for (const [width, height] of VIEWPORTS) {
  test(`colour reading at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    const report = [];
    await page.goto('/e2e/colour-reading.html');
    await expect(page.getByTestId('colour-reading-mine_correct')).toBeVisible();
    for (const [index, tab] of TABS.entries()) {
      await page.getByTestId(`colour-reading-tab-${tab}`).click();
      await page.waitForTimeout(250);
      for (const issue of await page.evaluate(auditScreen)) report.push(`${tab}: ${issue}`);
      await page.screenshot({ path: info.outputPath(`${index + 1}-${tab}.png`), fullPage: true });
    }
    if (process.env.LIVE_TEXT_AUDIT_REPORT) console.log(`\n=== ${width}x${height} ===\n${report.join('\n') || 'clean'}`);
    expect(report).toEqual([]);
  });
}
