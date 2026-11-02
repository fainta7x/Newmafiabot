import { test } from '@playwright/test';
const ROLE_SEQUENCE = ['Мирный', 'Мафия', 'Мирный', 'Шериф', 'Мирный', 'Мафия', 'Мирный', 'Дон', 'Мирный', 'Мирный'];

// The same start as the scripted audit: the real game window (with the seat cards the app has), up to the first round.
const tableGrid = (page) => page.locator('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]').first();
const seatCard = (page, slot) => tableGrid(page).locator(':scope > div').nth(slot - 1);
const clickOptional = async (locator) => { if (await locator.isVisible().catch(() => false)) await locator.click(); };

// `start` is where the random walk begins: the first round, the end of the speeches, the vote count, its result, the night, the day.
const restore = async (page, start = 'round0') => {
  await page.goto('/e2e/live-game.html');
  await page.getByRole('button', { name: 'Подтвердить состав' }).click();
  await page.getByTestId('zero-round-rule').getByRole('radio', { name: 'Турнирная' }).click();
  await page.getByRole('button', { name: /Начать раздачу ролей/ }).click();
  await page.getByTestId('physical-role-deal-start').click();
  for (const role of ROLE_SEQUENCE) await page.getByRole('button', { name: new RegExp(role) }).click();
  await page.getByRole('button', { name: /Роли зафиксированы/ }).click();
  await page.getByRole('button', { name: /Включите музыку/ }).click();
  await page.getByRole('button', { name: /Договорка · 75с/ }).click();
  await page.getByRole('button', { name: /Вызов шерифа · 10с/i }).click();
  await page.getByRole('button', { name: /Свободная посадка · 40с/ }).click();
  await page.getByRole('button', { name: /Выключите музыку/ }).click();
  await page.getByRole('button', { name: /Открыть нулевой круг/ }).click();
  await page.waitForSelector('.evening-live-engine-shell .live-seat-card');
  if (start === 'round0') return;
  const speech = async (slot, nominee) => {
    await page.getByRole('button', { name: new RegExp(`Речь #${slot}(?:\\s| ·|$)`) }).last().click();
    if (nominee) {
      await seatCard(page, nominee).click();
      await page.locator('div[class*="z-[112]"]').getByRole('button', { name: 'Выставить', exact: true }).click();
    }
    await page.getByRole('button', { name: new RegExp(`Завершить речь #${slot}`) }).click();
  };
  await clickOptional(page.getByTestId('live-auto-toggle'));
  await clickOptional(page.getByTestId('live-auto-toggle'));
  await speech(1, 2);
  await speech(2, 3);
  for (let slot = 3; slot <= 10; slot += 1) await speech(slot);
  if (start === 'speeches') return;
  await page.getByRole('button', { name: 'К голосованию', exact: true }).click();
  await page.getByRole('button', { name: 'Начать голосование', exact: true }).click();
  await page.getByRole('button', { name: 'Свернуть', exact: true }).click();
  if (start === 'voting') return;
  for (const voter of [1, 2, 3, 4, 5, 6]) await seatCard(page, voter).click();
  await page.getByRole('button', { name: /Следующий/ }).click();
  await page.getByRole('button', { name: 'Подвести итог', exact: true }).click();
  if (start === 'result') return;
  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  for (const seat of [1, 4, 8]) await page.locator('div[class*="z-[120]"]').getByRole('button', { name: String(seat), exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить лучший ход', exact: true }).click();
  await page.getByRole('button', { name: 'Завершить последние речи', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить → дальше', exact: true }).click();
  if (start === 'night') return;
  await clickOptional(page.getByRole('button', { name: /Включите музыку/ }));
  await page.getByRole('button', { name: 'Отстрел', exact: true }).click();
  await page.getByRole('button', { name: 'Проверка Дона', exact: true }).click();
  await page.getByTestId('night-prompt-choose').click();
  await seatCard(page, 1).click();
};


const P = "html body .evening-live-seatgrid .live-seat-card--grid";
const VARIANTS = {
  A: `@layer seat-grid {
    ${P}[data-candidate='current'] { background: var(--cand-fill) !important; border-color: #fff !important; box-shadow: 0 0 0 3px #fff, 0 0 30px var(--cand-fill) !important; position: relative; overflow: visible !important; }
    ${P}[data-candidate='current']::before { content: 'ПРОТИВ'; position: absolute; top: -9px; left: 50%; transform: translateX(-50%); background: #fff; color: #111; font: 900 10px/1 system-ui; letter-spacing: .14em; padding: 3px 9px; border-radius: 8px; z-index: 40; }
    ${P}[data-candidate='current'] .live-seat-id__name { background: rgba(0,0,0,.55) !important; }
    ${P}[data-vote]:not([data-candidate]) { background: #0b0c10 !important; box-shadow: none !important; border: 2px solid var(--seat-line) !important; }
  }`,
  B: `@layer seat-grid {
    ${P}[data-candidate='current'] { background: color-mix(in srgb, var(--cand-fill) 45%, #0b0c10) !important; border-color: #fff !important; box-shadow: inset 0 0 0 3px #fff, 0 0 0 4px var(--cand-fill), 0 0 28px var(--cand-fill) !important; }
    ${P}[data-vote]:not([data-candidate]) { background: #0b0c10 !important; border: 4px solid var(--seat-line) !important; box-shadow: none !important; }
    ${P}:not([data-vote]):not([data-candidate]) { opacity: .35 !important; filter: grayscale(.7) !important; }
  }`,
  C: `@layer seat-grid {
    ${P}[data-candidate='current'] { background: #0b0c10 !important; border-color: #fff !important; box-shadow: inset 0 0 0 2px #fff !important; position: relative; overflow: visible !important; }
    ${P}[data-candidate='current']::before { content: '🎯 ПРОТИВ'; position: absolute; left: 0; right: 0; top: 0; height: 18px; background: var(--cand-fill); color: #fff; font: 900 10px/18px system-ui; letter-spacing: .1em; text-align: center; z-index: 40; border-radius: 6px 6px 0 0; }
    ${P}[data-vote]:not([data-candidate]) { background: color-mix(in srgb, var(--seat-fill) 30%, #0b0c10) !important; border: 2px solid var(--seat-line) !important; box-shadow: none !important; position: relative; }
    ${P}[data-vote]:not([data-candidate])::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 7px; background: var(--seat-line); z-index: 30; border-radius: 4px 4px 0 0; }
    ${P}:not([data-vote]):not([data-candidate]) { opacity: .5 !important; }
  }`,
};
test('variants', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 390, height: 844 });
  await restore(page, 'voting');
  const grid = page.locator('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]').first();
  for (const voter of [1, 3, 4, 5, 6]) await grid.locator(':scope > div').nth(voter - 1).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/var_0.png' });
  await page.evaluate(() => {
    const voter = document.querySelector('.live-seat-card[data-vote]');
    const cs = getComputedStyle(voter);
    const root = document.documentElement;
    root.style.setProperty('--cand-fill', cs.getPropertyValue('--seat-fill') || '#ea580c');
    root.style.setProperty('--cand-line', cs.getPropertyValue('--seat-line') || '#fb923c');
  });
  for (const [name, css] of Object.entries(VARIANTS)) {
    const handle = await page.addStyleTag({ content: css });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `/tmp/var_${name}.png` });
    await handle.evaluate((node) => node.remove());
  }
});
