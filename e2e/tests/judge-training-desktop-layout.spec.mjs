import { expect, test } from '@playwright/test';

const TRAINING_ROLES = [
  'Мирный', 'Мирный', 'Мафия', 'Мирный', 'Дон',
  'Мирный', 'Мирный', 'Шериф', 'Мафия', 'Мирный',
];

test.describe.configure({ retries: 0 });

for (const width of [1366, 1600]) {
  test(`desktop guided judging keeps board separate from readable task rail at ${width}px`, async ({ page }, info) => {
    test.setTimeout(210_000);
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 900 });
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
    await page.screenshot({ path: info.outputPath(`desktop-role-deal-${width}.png`) });
    await page.getByTestId('physical-role-deal-start').click();

    for (const role of TRAINING_ROLES) {
      await page.getByRole('button', { name: new RegExp(role) }).click();
    }
    await page.getByRole('button', { name: /Роли зафиксированы/ }).click();

    const shell = page.locator('.evening-live-engine-shell[data-training-input-gate="active"]');
    await expect(shell.locator('.live-seat-card')).toHaveCount(10);
    await expect(shell.locator('.evening-live-identity')).toHaveCount(10);
    const desktopPanel = page.getByTestId('judge-training-desktop-panel');
    await expect(desktopPanel).toBeVisible();
    await expect(page.getByTestId('judge-training-task-trigger')).toBeHidden();
    await expect(page.getByTestId('judge-training-task-dialog')).toBeHidden();
    await expect(desktopPanel).toContainText('Знакомство со столом');

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
        panel: bounds(document.querySelector('[data-testid="judge-training-desktop-panel"]')),
        board: bounds(board),
        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
        docWidth: document.documentElement.scrollWidth,
        seats,
      };
    });
    expect(geometry.sameCanonicalWrapper).toBe(true);
    expect(geometry.coachOutsideShell).toBe(true);
    expect(geometry.gridColumns).toBeGreaterThanOrEqual(4);
    expect(geometry.gridRows).toBe(3);
    expect(geometry.docWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.panel.left).toBeGreaterThan(geometry.board.right + 12);
    expect(geometry.panel.right).toBeLessThanOrEqual(geometry.viewportWidth - 10);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(48);
    expect(geometry.board.bottom).toBeLessThanOrEqual(geometry.viewportHeight - 55);
    for (const seat of geometry.seats) {
      expect(seat.exists, `seat ${seat.seat}: missing avatar or card`).toBe(true);
      expect(seat.deviation, `seat ${seat.seat}: avatar does not match interactive card`).toBeLessThan(9);
    }
    await page.screenshot({ path: info.outputPath(`desktop-guided-table-${width}.png`), fullPage: false });
    // The desktop introduction is an in-place panel, not a blocking overlay.
    for (let step = 0; step < 3; step += 1) {
      await expect(desktopPanel).toContainText('Шаг ' + (step + 1) + ' из 3');
      await page.getByTestId('judge-training-desktop-next').click();
    }
    await expect(desktopPanel).toContainText('Текущее задание');
    await expect(page.getByTestId('judge-training-task-dialog')).toBeHidden();
    await page.getByTestId('judge-training-desktop-highlight').click();
    await page.getByTestId('judge-training-desktop-highlight').click();
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
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Заверши речь #3/);
    await page.getByRole('button', { name: /Завершить речь #3/ }).click();

    // Player #3 is penalized while player #4 is speaking, not during their own speech.
    // The +30 action is not available in the zero circle.
    await page.getByRole('button', { name: /^Речь #4$/ }).click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Обычный фол игроку #3/);
    await page.getByTestId('live-player-actions-center-selector').selectOption('3');
    await page.locator('[data-testid="live-player-add-regular-foul"][data-seat="3"]').click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Заверши речь #4/);
    await expect(page.getByTestId('live-hud-speech-extension')).toHaveCount(0);
    await page.getByRole('button', { name: /Завершить речь #4/ }).click();

    for (let seat = 5; seat <= 10; seat += 1) {
      await page.getByRole('button', { name: new RegExp('^Речь #' + seat) }).click();
      if (seat === 7) await shell.locator('.live-seat-card[data-seat="3"] .live-seat-quick-action--nomination').click();
      await page.getByRole('button', { name: new RegExp('Завершить речь #' + seat) }).click();
    }
    await page.getByTestId('live-judge-hud').getByRole('button', { name: 'К голосованию', exact: true }).click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Голоса против #1/);
    const voter = shell.locator('.live-seat-card[data-seat="2"]');
    await expect(voter).toHaveAttribute('data-judge-training-kind', 'vote');
    const nominee = shell.locator('.live-seat-card[data-seat="1"]');
    await expect(nominee).toHaveAttribute('data-nominated', 'true');
    for (const slot of [2,3,4,5,6]) await shell.locator('.live-seat-card[data-seat="' + slot + '"]').click();
    await page.screenshot({ path: info.outputPath(`desktop-voting-${width}.png`) });
    await page.getByTestId('live-voting-next').click();
    await page.getByTestId('live-voting-finalize').click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Первый попил 5:5/);
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

    // Second tie is 5:5, so the real engine requires the table's decision
    // instead of eliminating one candidate or starting an unplanned third ballot.
    await expect(page.getByTestId('judge-training-task-trigger'))
      .toHaveAttribute('aria-label', /Решение стола: руку поднял #2/);
    await expect(page.getByRole('button', { name: /Зафиксировать решение/ })).toBeVisible();
    await shell.locator('.live-seat-card[data-seat="2"]').click();
    await expect(page.getByTestId('judge-training-task-trigger'))
      .toHaveAttribute('aria-label', /Один голос — оба остаются/);
    const selectedForRaise = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('mafia_live_session') || '{}');
      return { selected: saved.tableDecisionSelectedVoterSlots, count: saved.tableLeaveVotesInput };
    });
    expect(selectedForRaise.selected).toEqual([2]);
    expect(selectedForRaise.count).toBe(1);
    await page.screenshot({ path: info.outputPath(`table-decision-one-hand-${width}.png`) });
    await page.getByRole('button', { name: /Зафиксировать решение/ }).click();
    await expect(page.getByTestId('judge-training-task-trigger'))
      .toHaveAttribute('aria-label', /Наступила ночь/);
    const live = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('mafia_live_session') || '{}');
      return { phase: saved.phase, alive: saved.activePlayers?.filter(p => p.alive)?.length };
    });
    expect(live.phase).toBe('night');
    expect(live.alive).toBe(10);
    await page.screenshot({ path: info.outputPath(`night-after-two-ties-${width}.png`) });

    // First real night: the lesson scripts shot, Don and Sheriff, then asks
    // the first killed player for three exact LH places (not free input).
    const hud = page.getByTestId('live-judge-hud');
    await hud.getByRole('button', { name: /Включить музыку ночи/ }).click();
    await hud.getByRole('button', { name: 'Отстрел', exact: true }).click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Мафия стреляет в #7/);
    await shell.locator('.live-seat-card[data-seat="7"]').click();
    await hud.getByRole('button', { name: /Проверка Дона/ }).click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Дон проверяет #8/);
    await shell.locator('.live-seat-card[data-seat="8"]').click();
    await hud.getByRole('button', { name: /Проверка Шерифа/ }).click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Шериф проверяет #3/);
    await shell.locator('.live-seat-card[data-seat="3"]').click();
    await hud.getByRole('button', { name: /Выключить музыку/ }).click();
    await hud.getByRole('button', { name: /ЛХ первого убитого/ }).click();

    const bestMove = page.getByTestId('live-best-move-sheet');
    await expect(bestMove).toBeVisible();
    await expect(page.getByTestId('judge-training-best-move-task')).toContainText('Нажми #3');
    await expect(page.getByTestId('live-best-move-confirm')).toBeDisabled();
    await expect(bestMove.locator('button[data-seat="4"]')).toBeDisabled();
    for (const slot of [3, 5, 9]) {
      await bestMove.locator('button[data-seat="' + slot + '"]').click();
    }
    await expect(page.getByTestId('live-best-move-confirm')).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`guided-best-move-${width}.png`) });
    await page.getByTestId('live-best-move-confirm').click();
    await hud.getByRole('button', { name: /Зафиксировать ночь/ }).click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Последняя речь убитого/);
    await hud.getByRole('button', { name: /Протокол убитого/ }).click();

    const death = page.getByTestId('judge-training-death-task');
    await expect(death).toBeVisible();
    await expect(page.getByTestId('live-death-protocol-save')).toBeDisabled();
    const steps = page.locator('[data-testid^="judge-training-death-"][data-training-next="true"]');
    const instructions = [];
    // The exact names are chosen per killed player and night, not hardcoded
    // to the same five answers for every victim.
    for (let i = 0; i < 5; i++) {
      if (await steps.count() === 0) break;
      await expect(steps).toHaveCount(1);
      const button = steps.first();
      instructions.push(await button.getAttribute('data-testid'));
      await button.click();
    }
    expect(instructions.length).toBeGreaterThanOrEqual(1);
    expect(instructions.length).toBeLessThanOrEqual(5);
    await expect(steps).toHaveCount(0);
    await expect(page.getByTestId('live-death-protocol-save')).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`guided-death-protocol-${width}.png`) });
    await page.getByTestId('live-death-protocol-save').click();
    await expect(page.getByTestId('judge-training-task-trigger')).toHaveAttribute('aria-label', /Начни речь/);
  });
}
