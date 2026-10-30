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
    const dialog = page.getByRole('dialog', { name: 'Шаблон сообщения' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Текст сообщения' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Копировать текст' })).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(845);
    // Telegram username links must carry the edited draft into the correct chat.
    await dialog.getByRole('button', { name: 'Закрыть' }).click();
    await page.getByTestId('gift-group-pledged').getByRole('button', { name: 'Написать' }).click();
    const telegramDialog = page.getByRole('dialog', { name: 'Шаблон сообщения' });
    const message = 'Проверка сообщения с пробелами 🎁';
    await telegramDialog.getByRole('textbox', { name: 'Текст сообщения' }).fill(message);
    const popupPromise = page.waitForEvent('popup');
    await telegramDialog.getByRole('button', { name: 'Открыть чат' }).click();
    const popup = await popupPromise;
    expect(popup.url()).toContain('t.me/testuser?text=');
    expect(new URL(popup.url()).searchParams.get('text')).toBe(message);
    await popup.close();
    const issues = await page.evaluate(auditScreen);
    await page.screenshot({ path: info.outputPath(`gift-outreach-${width}.png`), fullPage: true });
    expect(issues).toEqual([]);
  });
}
