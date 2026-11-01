import { expect, test } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

// Every screen of a live game, phone and desktop (owner, 2026-10-27: «текст на тексте», «ПЕРЕ…»): no text sits on other
// text, no label is cut to «…», nothing leaves its box or the screen, and no button is covered.
// LIVE_TEXT_AUDIT_REPORT=1 prints every finding instead of failing on the first screen.

const ROLE_SEQUENCE = ['Мирный', 'Мафия', 'Мирный', 'Шериф', 'Мирный', 'Мафия', 'Мирный', 'Дон', 'Мирный', 'Мирный'];
// Phones run twice: in the app's font and in a wider one (DejaVu Sans with a little letter spacing), so a label that only
// just fits does not pass — fonts differ between phones, and CI's Chrome renders wider than a local Chromium.
const VIEWPORTS = [[360, 640, false], [390, 844, false], [1366, 768, false], [1440, 900, false], [360, 640, true], [390, 844, true]];

const tableGrid = (page) => page.locator('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]').first();
const seatCard = (page, slot) => tableGrid(page).locator(':scope > div').nth(slot - 1);
const clickOptional = async (locator) => { if (await locator.isVisible().catch(() => false)) await locator.click(); };


for (const [width, height, wideFont] of VIEWPORTS) {
  test(`auto-mode countdown at ${width}x${height}${wideFont ? ' in a wide font' : ''}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    await page.clock.install();
    const report = [];
    const check = async (screen) => {
      await page.waitForTimeout(250);
      const found = await page.evaluate(auditScreen);
      await page.screenshot({ path: info.outputPath(`${screen}.png`) });
      for (const issue of found) report.push(`${screen}: ${issue}`);
    };
    if (wideFont) await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = ':root{--font-sans:"DejaVu Sans",sans-serif} body{letter-spacing:.02em}'; document.head.append(style); }));
    await page.goto('/e2e/live-game.html');
    await page.getByRole('button', { name: 'Подтвердить состав' }).click();
    await page.getByTestId('zero-round-rule').getByRole('radio', { name: 'Турнирная' }).click();
    await page.getByRole('button', { name: /Начать раздачу ролей/ }).click();
    await page.getByRole('button', { name: /Включить музыку и начать раздачу/ }).click();
    for (const role of ROLE_SEQUENCE) await page.getByRole('button', { name: new RegExp(role) }).click();
    await page.getByRole('button', { name: /Роли зафиксированы/ }).click();
    await page.getByRole('button', { name: /Включите музыку/ }).click();
    await page.getByRole('button', { name: /Договорка · 75с/ }).click();
    await page.getByRole('button', { name: /Вызов шерифа · 10с/i }).click();
    await page.getByRole('button', { name: /Свободная посадка · 40с/ }).click();
    await page.getByRole('button', { name: /Выключите музыку/ }).click();
    await page.getByRole('button', { name: /Открыть нулевой круг/ }).click();
    await clickOptional(page.getByTestId('live-auto-toggle'));
    await page.getByRole('button', { name: /Речь #1(?:\s| ·|$)/ }).last().click();
    await page.clock.fastForward(61_000);
    await page.clock.runFor(1500);
    await expect(page.getByTestId('live-auto-stop')).toBeVisible();
    await check('auto-countdown');
    if (process.env.LIVE_TEXT_AUDIT_REPORT) console.log(`\n=== countdown ${width}x${height}${wideFont ? '-wide' : ''} ===\n${report.join('\n') || 'clean'}`);
    expect(report).toEqual([]);
  });
}
