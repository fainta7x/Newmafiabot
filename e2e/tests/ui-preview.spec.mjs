import { test, expect } from '@playwright/test';

test('preview switches real screens and mobile dimensions without external requests', async ({ page }, testInfo) => {
  const externalRequests = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:4173/')) externalRequests.push(request.url());
  });
  await page.goto('/preview/index.html');
  const frame = page.frameLocator('#app');
  await expect(frame.getByTestId('evening-active-roster')).toBeVisible();
  await page.getByLabel('Размер').selectOption('360,640');
  await expect(page.locator('#app')).toHaveCSS('width', '360px');
  await page.getByLabel('Экран').selectOption('live-game');
  await expect(frame.locator('#root')).not.toBeEmpty();
  await page.getByLabel('Экран').selectOption('player-shell');
  await expect(frame.locator('#root')).not.toBeEmpty();
  await page.getByLabel('Экран').selectOption('crm-evening-roster');
  await expect(frame.getByTestId('evening-active-roster')).toBeVisible();
  await expect(page.locator('#revision')).toContainText('Код:');
  expect(externalRequests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('ui-preview-gallery.png'), fullPage: true });
});
