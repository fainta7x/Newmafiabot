import { test, expect } from '@playwright/test';

// The game protocol window: one frame, four places, edits in sheets. Checked on a phone, a tablet and a desktop for what a
// screenshot cannot say: nothing leaves the viewport, every control is a 44 px target, no console errors, and an edit is
// listed, saved and can be taken back.
const sizes = [[360, 740], [390, 844], [768, 1024], [1280, 820]];

const place = (page, width, name) => (width >= 1024 ? page.locator('aside').getByRole('button', { name }) : page.locator('nav').last().getByRole('button', { name }));

const geometry = (page) => page.evaluate(() => {
  const root = document.querySelector('[data-testid=protocol-window]');
  const vw = document.documentElement.clientWidth;
  const outside = [];
  const small = [];
  root.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if ((r.right > vw + 1 || r.left < -1) && !el.closest('[class*=overflow-x-auto]')) outside.push(`${el.tagName} ${Math.round(r.left)}..${Math.round(r.right)}`);
  });
  root.querySelectorAll('button, select, a[href]').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width && r.height && (r.height < 43.5 || r.width < 43.5)) small.push(`${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  return { outside, small, pageScrolls: document.documentElement.scrollWidth > vw };
});

for (const [width, height] of sizes) {
  test(`protocol window fits and stays touchable at ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('response', (response) => { if (response.status() >= 400 && !/favicon/.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
    page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text()); });
    await page.setViewportSize({ width, height });
    await page.goto('/e2e/protocol-window.html?draft=1');
    await expect(page.getByTestId('protocol-window')).toBeVisible();
    const check = async (label) => {
      const result = await geometry(page);
      expect(result.pageScrolls, `${label}: the page scrolls sideways`).toBe(false);
      expect(result.outside, `${label}: elements outside the viewport`).toEqual([]);
      expect(result.small, `${label}: targets under 44px`).toEqual([]);
    };

    await check('overview');
    await page.screenshot({ path: testInfo.outputPath(`protocol-overview-${width}.png`) });

    await place(page, width, 'Ход игры').click();
    await page.getByRole('tab', { name: 'Круг 1' }).click();
    await expect(page.getByTestId('voting-summary').first()).toContainText('Ушёл #7');
    await check('game');
    await page.screenshot({ path: testInfo.outputPath(`protocol-game-${width}.png`) });

    // one ballot is changed in a sheet; the result is no longer confirmed and the change is listed
    await page.getByRole('button', { name: /Голос игрока 3 .* за 7: изменить/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await check('ballot sheet');
    await page.screenshot({ path: testInfo.outputPath(`protocol-ballot-${width}.png`) });
    await page.getByRole('dialog').getByRole('button', { name: /Борис|Глеб/ }).last().click();
    await place(page, width, 'Обзор').click();
    await expect(page.getByText(/Вы изменили · /)).toBeVisible();
    await check('overview with changes');
    await page.screenshot({ path: testInfo.outputPath(`protocol-changes-${width}.png`) });
    await page.getByRole('button', { name: /Вернуть: Круг 1/ }).click();
    await expect(page.getByText(/Вы изменили/)).toHaveCount(0);

    await place(page, width, 'Игроки').click();
    await expect(page.getByText('Убит ночью').first()).toBeVisible();
    await check('players');
    await page.screenshot({ path: testInfo.outputPath(`protocol-players-${width}.png`) });
    await page.getByRole('button', { name: /Игрок 9 .*открыть/ }).click();
    await check('player sheet');
    await page.screenshot({ path: testInfo.outputPath(`protocol-player-sheet-${width}.png`) });
    await page.keyboard.press('Escape');

    await place(page, width, 'Итог').click();
    await check('result');
    await page.screenshot({ path: testInfo.outputPath(`protocol-result-${width}.png`) });
    expect(errors).toEqual([]);
  });
}
