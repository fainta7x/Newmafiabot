import { expect, test } from '@playwright/test';

const TRAINING_ROLES = [
  'Мирный', 'Мирный', 'Мафия', 'Мирный', 'Дон',
  'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мирный',
];

test.describe.configure({ retries: 0 });

for (const width of [360, 390]) {
  test(`judge training mirrors the real table without overlapping its seats at ${width}px`, async ({ page }, info) => {
    test.setTimeout(160_000);
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

    await expect(page.getByTestId('physical-role-deal-intro')).toBeVisible();
    await page.getByTestId('physical-role-deal-start').click();

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
    // The lesson still uses the live judge buttons, but must not prompt for
    // player login or try to play real club music during the zero night.
    await page.getByTestId('judge-training-task-trigger').click();
    for (let step = 0; step < 3; step += 1) {
      await expect(page.getByTestId('judge-training-task-dialog')).toBeVisible();
      await page.getByRole('button', { name: step < 2 ? 'Дальше' : 'К заданиям' }).click();
      if (step < 2) await expect(page.getByTestId('judge-training-task-dialog')).toBeVisible();
    }
    await expect(page.getByTestId('judge-training-task-dialog')).toHaveCount(0);
    await page.getByRole('button', { name: /Включить музыку ночи/ }).click();
    await expect(page.getByRole('button', { name: /Договорка.*75с/ })).toBeVisible();
    await expect(page.getByText('Player authentication required.')).toHaveCount(0);

    // Live game controls stay in place when a timed speech replaces "next".
    await page.getByRole('button', { name: /Договорка.*75с/ }).click();
    await page.getByRole('button', { name: /Вызов шерифа.*10с/i }).click();
    await page.getByRole('button', { name: /Свободная посадка.*40с/ }).click();
    await page.getByRole('button', { name: /Выключить музыку/ }).click();
    await page.getByRole('button', { name: /Открыть нулевой круг/ }).click();

    const board = shell.locator('div[class*="grid-cols-2"][class*="md:grid-cols-5"]:has(> .live-seat-card)');
    const measure = () => board.evaluate(element => {
      const r = element.getBoundingClientRect();
      const cell = element.querySelector('.live-seat-card[data-seat="1"]')?.getBoundingClientRect();
      return { height: r.height, top: r.top, firstSeatBottom: cell?.bottom || 0 };
    });
    const idleGeometry = await measure();
    await page.getByRole('button', { name: /^Речь #1$/ }).click();
    const speakingGeometry = await measure();
    expect(Math.abs(idleGeometry.height - speakingGeometry.height)).toBeLessThan(2);
    expect(Math.abs(idleGeometry.firstSeatBottom - speakingGeometry.firstSeatBottom)).toBeLessThan(5);
    await page.getByRole('button', { name: /Завершить речь #1/ }).click();

    // Nomination and voter highlights must be semantically different.
    await page.getByRole('button', { name: /^Речь #2$/ }).click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /выставляет #1/);
    await shell.locator('.live-seat-card[data-seat="1"] .live-seat-quick-action--nomination').click();
    await page.getByRole('button', { name: /Завершить речь #2/ }).click();

    await page.getByRole('button', { name: /^Речь #3$/ }).click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Обычный фол игроку #3/);
    await page.getByTestId('live-player-actions-center-selector').selectOption('3');
    await page.locator('[data-testid="live-player-add-regular-foul"][data-seat="3"]').click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Заверши речь #3/);
    await page.getByRole('button', { name: /Завершить речь #3/ }).click();

    // +30 is forbidden on the zero round. Here we verify ordinary speech.
    // A separate later-day test validates the +30-for-two-new-fouls rule.
    await page.getByRole('button', { name: /^Речь #4$/ }).click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Заверши речь #4/);
    await expect(page.getByTestId('live-hud-speech-extension')).toHaveCount(0);
    await page.getByRole('button', { name: /Завершить речь #4/ }).click();

    for (let seat = 5; seat <= 10; seat += 1) {
      await page.getByRole('button', { name: new RegExp('^Речь #' + seat) }).click();
      if (seat === 7) await shell.locator('.live-seat-card[data-seat="3"] .live-seat-quick-action--nomination').click();
      await page.getByRole('button', { name: new RegExp('Завершить речь #' + seat) }).click();
    }
    await page.getByRole('button', { name: /К голосованию/ }).click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Голоса против #1/);
    const voter = shell.locator('.live-seat-card[data-seat="2"]');
    await expect(voter).toHaveAttribute('data-judge-training-kind', 'vote');
    const nominee = shell.locator('.live-seat-card[data-seat="1"]');
    await expect(nominee).toHaveAttribute('data-nominated', 'true');
    for (const slot of [2,3,4,5,6]) await shell.locator('.live-seat-card[data-seat="' + slot + '"]').click();
    await page.getByTestId('live-voting-next').click();
    await page.getByTestId('live-voting-finalize').click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Итог: решение движка/);
    await page.getByRole('button', { name: /Речи по 30 секунд/ }).click();
    await page.getByRole('button', { name: 'Следующий игрок' }).click();
    await page.getByRole('button', { name: 'К переголосованию' }).click();
    // The coach is still strict during the *second* ballot.
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Голоса против/);
    const highlightedVotes = shell.locator('.live-seat-card[data-judge-training-kind="vote"]');
    await expect(highlightedVotes.first()).toBeVisible();
    const seatsToClick = await highlightedVotes.evaluateAll(nodes => nodes.map(node => Number(node.dataset.seat)));
    expect(seatsToClick.length).toBeGreaterThan(0);
    for (const slot of seatsToClick) await shell.locator('.live-seat-card[data-seat="' + slot + '"]').click();
    await page.getByTestId('live-voting-next').click();
    await page.getByTestId('live-voting-finalize').click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Итог: решение движка/);
  });
}
