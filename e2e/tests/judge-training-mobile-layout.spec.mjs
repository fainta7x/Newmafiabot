import { expect, test } from '@playwright/test';

const TRAINING_ROLES = [
  'Мирный', 'Мирный', 'Мафия', 'Мирный', 'Дон',
  'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мирный',
];

test.describe.configure({ retries: 0 });

for (const width of [360, 390]) {
  test(`judge training mirrors the real table without overlapping its seats at ${width}px`, async ({ page }, info) => {
    test.setTimeout(75_000);
    await page.setViewportSize({ width, height: 700 });
    await page.goto('/e2e/live-game.html?mode=training');

    for (let seat = 1; seat <= 10; seat += 1) {
      const description = await page.getByTestId('judge-training-seat-task').innerText();
      const player = description.match(/Игрок \d+/)?.[0];
      expect(player, `seat ${seat} has an instructed participant`).toBeTruthy();
      await page.getByRole('button', { name: `${player} +`, exact: true }).click();
    }
    await page.getByTestId('judge-training-seat-finish').click();
    await page.getByRole('button', { name: 'Подтвердить состав' }).click();
    await page.getByRole('button', { name: /Начать раздачу ролей/ }).click();

    const intro = page.getByText('Подготовьте 10 карт');
    await expect(intro).toBeVisible();
    await intro.locator('xpath=ancestor::section[1]').getByRole('button', { name: 'Начать раздачу', exact: true }).click();

    for (const role of TRAINING_ROLES) {
      await page.getByRole('button', { name: new RegExp(role) }).click();
    }
    await page.getByRole('button', { name: /Роли зафиксированы/ }).click();

    const shell = page.locator('.evening-live-engine-shell[data-training-input-gate="active"]');
    await expect(shell.locator('.live-seat-card')).toHaveCount(10);
    await expect(shell.locator('.evening-live-identity')).toHaveCount(10);
    await expect(page.getByTestId('judge-training-task-dialog')).toBeVisible();
    await page.getByRole('button', { name: 'К игровому столу' }).click();
    await expect(page.getByTestId('judge-training-task-dialog')).toHaveCount(0);

    const geometry = await page.evaluate(() => {
      const modal = document.querySelector('.fixed.inset-0.z-\\[95\\]');
      const shell = document.querySelector('.evening-live-engine-shell[data-training-input-gate="active"]');
      const board = shell?.querySelector('div[class*="grid-cols-2"][class*="md:grid-cols-5"]:has(> .live-seat-card)');
      const coach = document.querySelector('[data-testid="judge-conduct-coach"]');
      const trigger = document.querySelector('[data-testid="judge-training-task-trigger"]');
      const close = document.querySelector('button[title="Закрыть движок"]');
      const bounds = (node) => {
        const r = node?.getBoundingClientRect();
        return r && { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      };
      const seats = Array.from({ length: 10 }, (_, idx) => {
        const seat = idx + 1;
        const card = board?.querySelector(`.live-seat-card[data-seat="${seat}"]`);
        const identity = shell?.querySelector(`.evening-live-identity[data-seat="${seat}"]`);
        const a = bounds(card), b = bounds(identity);
        return {
          seat,
          exists: Boolean(a && b),
          deviation: a && b ? Math.max(
            Math.abs(a.left - b.left), Math.abs(a.right - b.right),
            Math.abs(a.top - b.top), Math.abs(a.bottom - b.bottom)
          ) : 999,
        };
      });
      return {
        coachOutsideShell: coach?.parentElement === modal,
        sameCanonicalWrapper: shell?.parentElement?.parentElement === modal,
        gridColumns: board ? getComputedStyle(board).gridTemplateColumns.split(' ').length : 0,
        gridRows: board ? getComputedStyle(board).gridTemplateRows.split(' ').length : 0,
        trigger: bounds(trigger),
        close: bounds(close),
        viewportWidth: innerWidth,
        docWidth: document.documentElement.scrollWidth,
        seats,
      };
    });
    expect(geometry.sameCanonicalWrapper).toBe(true);
    expect(geometry.coachOutsideShell).toBe(true);
    expect(geometry.gridColumns).toBe(4);
    expect(geometry.gridRows).toBe(3);
    expect(geometry.docWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.trigger.right).toBeLessThan(geometry.close.left);
    for (const seat of geometry.seats) {
      expect(seat.exists, `seat ${seat.seat}: missing avatar or card`).toBe(true);
      expect(seat.deviation, `seat ${seat.seat}: avatar does not match interactive card`).toBeLessThan(9);
    }
    await page.screenshot({ path: info.outputPath(`real-table-training-${width}.png`), fullPage: false });
  });
}
