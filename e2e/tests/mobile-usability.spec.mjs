import { test, expect } from '@playwright/test';

for (const width of [360, 390]) {
  test(`mobile work surfaces ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 360 ? 640 : 713 });
    await page.goto('/e2e/crm-evening-roster.html');
    // Test the mounted list without depending on fixture row IDs.
    await expect(page.getByRole('button', { name: 'Пришёл', exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath('roster.png') });
    await page.goto('/e2e/player-cabinet.html');
    await expect(page.getByRole('heading', { name: 'Главная', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Выбрать игры →' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('player-home.png') });
    await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Игры', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Статистика', exact: true })).toBeInViewport();
    await page.screenshot({ path: info.outputPath('player-games.png') });
    await page.goto('/e2e/live-game.html?mode=audit');
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
    await page.getByRole('button', { name: 'К голосованию', exact: true }).click();
    for (let n = 1; n <= 5; n++) await page.locator(`.live-seat-card[data-seat="${n}"]`).click();
    await page.getByRole('button', { name: 'Следующий →', exact: true }).click();
    await page.getByRole('button', { name: 'Подвести итог', exact: true }).click();
    await page.getByRole('button', { name: 'Речи по 30 секунд', exact: true }).click();
    await page.getByRole('combobox', { name: 'Быстрые действия игрока' }).selectOption({ label: '#2 Игрок 2' });
    await page.getByRole('button', { name: '+ Обычный фол', exact: true }).click();
    await expect(page.getByLabel('Фолы 1, малые техфолы 0, большие техфолы 0')).toBeVisible();
    const next = page.getByRole('button', { name: 'Следующий игрок', exact: true });
    await expect(next).toBeInViewport();
    const fits = await next.evaluate(el => {
      const r = el.getBoundingClientRect();
      let parent = el.parentElement;
      while (parent) {
        const style = getComputedStyle(parent);
        if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)) {
          const p = parent.getBoundingClientRect();
          if (r.bottom > p.bottom + 1 || r.top < p.top - 1) return false;
        }
        parent = parent.parentElement;
      }
      return r.height >= 31;
    });
    expect(fits).toBe(true);
    await page.screenshot({ path: info.outputPath('revote-speech.png') });
    await next.click();
    await page.getByRole('button', { name: 'К переголосованию', exact: true }).click();
    await expect(page.getByText('Переголосование 1', { exact: true })).toBeVisible();
  });
}
