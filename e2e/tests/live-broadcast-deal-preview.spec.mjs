import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

// The role deal on the OBS screen (owner, 2026-11-03): the choosing seat is lit, the chosen card turns over to its role.
for (const [width, height] of [[1920, 1080], [1920, 1089], [1366, 768]]) {
  test(`broadcast shows the role deal at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto('/e2e/live-broadcast-deal.html');
    await expect(page.locator('.live-broadcast-deal-card')).toHaveCount(8);
    await expect(page.locator('.live-broadcast-deal-who')).toContainText('№3 Дина');
    await expect(page.locator('.live-broadcast-player.is-speaking .live-broadcast-player-name')).toHaveText('Дина');
    await expect(page.locator('.live-broadcast-deal-card.is-open [data-role-card-face="sheriff"]')).toBeVisible();
    await page.waitForTimeout(900); // the card has turned over
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    const findings = await page.evaluate(auditScreen);
    expect(findings, JSON.stringify(findings, null, 2)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`broadcast-deal-${width}.png`) });
  });
}
