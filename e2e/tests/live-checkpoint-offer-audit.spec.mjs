import { expect, test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

// «Продолжить игру» (owner, 2026-11-03): the offer to continue a game from the server copy, at the five audit sizes.
const VIEWPORTS = [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]];

for (const [width, height] of VIEWPORTS) {
  test(`continue-game offer at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto('/e2e/live-checkpoint-offer.html');
    await expect(page.getByTestId('live-checkpoint-continue')).toBeVisible();
    await page.waitForTimeout(250);
    const report = await page.evaluate(auditScreen);
    await page.screenshot({ path: info.outputPath('offer.png') });
    if (process.env.LIVE_TEXT_AUDIT_REPORT) console.log(`\n=== ${width}x${height} ===\n${report.join('\n') || 'clean'}`);
    expect(report).toEqual([]);
  });
}

test('«Продолжить игру» opens the game where the server copy left it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/e2e/live-checkpoint-offer.html');
  await page.getByTestId('live-checkpoint-continue').click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('mafia_live_session') || 'null')?.roundNumber)).toBe(2);
  await expect(page.getByText('Раздача ролей')).toHaveCount(0);
});
