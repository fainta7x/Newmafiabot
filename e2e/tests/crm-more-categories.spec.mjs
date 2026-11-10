import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

for (const [width, height] of [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]]) {
  test(`«Ещё»: six categories on one screen at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto('/e2e/crm-more.html');
    for (const id of ['run', 'people', 'game', 'messages', 'money', 'system']) await expect(page.getByTestId(`crm-more-cat-${id}`)).toBeVisible();
    // no scrolling to reach any category or the logout button (the harness has the fixed bottom navigation on top)
    const box = await page.getByRole('button', { name: /Выйти из кабинета/ }).boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(height - 64);
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath(`more-root-${width}.png`), fullPage: false });
    await page.getByTestId('crm-more-cat-game').click();
    await expect(page.getByTestId('crm-more-vip')).toBeVisible();
    await expect(page.getByTestId('crm-more-achievements')).toBeVisible();
    expect(await page.evaluate(auditScreen)).toEqual([]);
    await page.getByRole('button', { name: /Назад к разделам/ }).click();
    await expect(page.getByTestId('crm-more-cat-game')).toBeVisible();
  });
}
