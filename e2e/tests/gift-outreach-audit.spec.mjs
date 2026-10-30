import { expect, test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

for (const width of [360, 390]) {
  test(`gift outreach editor at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/e2e/crm-gift-outreach.html?collection=gift-1');
    await expect(page.getByTestId('gift-collection-detail')).toBeVisible();
    await expect(page.getByTestId('gift-group-invited')).toBeVisible();
    await expect(page.getByTestId('gift-group-pledged')).toBeVisible();
    await expect(page.getByTestId('gift-group-paid')).toBeVisible();
    await expect(page.getByTestId('gift-group-declined')).toBeVisible();
    await page.getByTestId('gift-group-invited').getByRole('button', { name: 'Написать' }).click();
    await expect(page.getByRole('textbox', { name: 'Текст сообщения' })).toBeVisible();
    const issues = await page.evaluate(auditScreen);
    await page.screenshot({ path: info.outputPath(`gift-outreach-${width}.png`), fullPage: true });
    expect(issues).toEqual([]);
  });
}
