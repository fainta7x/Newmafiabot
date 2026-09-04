import { expect, test } from '@playwright/test';

const players = Array.from({ length: 10 }, (_, index) => {
  const seat = index + 1;
  const role = seat === 10 ? 'Дон' : seat === 8 || seat === 9 ? 'Мафия' : seat === 7 ? 'Шериф' : 'Мирный';
  const team = seat >= 8 ? 'Чёрные' : 'Красные';
  const status = seat === 2
    ? { alive: false, status: 'Убит ночью', statusKind: 'killed' }
    : seat === 5
      ? { alive: false, status: 'Заголосован', statusKind: 'voted' }
      : seat === 9
        ? { alive: false, status: 'Удалён: 4-й фол', statusKind: 'removed' }
        : { alive: true, status: 'В игре', statusKind: 'alive' };
  return {
    seat,
    playerId: null,
    nickname: ['Матроскина', 'Фандорин', 'Пристань', 'Денди', 'Знак', 'Насон', 'Богданчик', 'Джава', 'Спящий', 'Вид'][index],
    role,
    team,
    ...status,
    fouls: seat === 4 ? 2 : seat === 9 ? 4 : 0,
    minorTech: seat === 6 ? 1 : 0,
    majorTech: 0,
    ppk: false,
  };
});

const fixedVote = {
  connected: true,
  receivedAt: '2026-09-04T18:30:00.000Z',
  state: {
    version: 1,
    gameId: 238,
    globalGameNumber: 238,
    eveningGameNumber: 4,
    tableName: 'Основной стол',
    phaseKey: 'day_voting',
    phaseTitle: 'День 1 · голосование',
    phaseDetail: 'Результат голосования',
    roundNumber: 2,
    currentSpeakerSeat: null,
    timerSeconds: 30,
    timerMaxSeconds: 60,
    timerRunning: false,
    timerLabel: null,
    players,
    nominations: [
      { seat: 3, order: 1, nominatedBy: 1 },
      { seat: 7, order: 2, nominatedBy: 4 },
      { seat: 9, order: 3, nominatedBy: 6 },
    ],
    vote: {
      roundNumber: 1,
      isRevote: false,
      candidates: [3, 7, 9],
      highlightedCandidates: [3, 7, 9],
      published: true,
      counts: { 3: 3, 7: 3, 9: 4 },
      assignments: { 1: 3, 2: 3, 3: 3, 4: 7, 5: 7, 6: 7, 7: 9, 8: 9, 9: 9, 10: 9 },
      outcome: 'single_eliminated',
    },
    updatedAt: '2026-09-04T18:30:00.000Z',
  },
};

test.use({ viewport: { width: 1920, height: 1080 } });

test('OBS overlay fits 1920x1080 and reveals only a fixed vote', async ({ page }, testInfo) => {
  await page.route('**/api/public/broadcast/e2e-token', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixedVote) });
  });

  await page.goto('/broadcast/e2e-token');
  await expect(page.getByText('Игра вечера №4')).toBeVisible();
  await expect(page.getByText('Зафиксировано')).toBeVisible();
  await expect(page.locator('.live-broadcast-player')).toHaveCount(10);
  await expect(page.locator('.live-broadcast-voters span')).toHaveCount(10);

  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    playerBottom: Math.max(...Array.from(document.querySelectorAll('.live-broadcast-player')).map((node) => node.getBoundingClientRect().bottom)),
    playerTop: Math.min(...Array.from(document.querySelectorAll('.live-broadcast-player')).map((node) => node.getBoundingClientRect().top)),
    infoBottom: document.querySelector('.live-broadcast-info-row')?.getBoundingClientRect().bottom || 0,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.playerBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.infoBottom).toBeLessThan(metrics.playerTop - 12);

  const screenshot = testInfo.outputPath('live-broadcast-1920x1080.png');
  await page.screenshot({ path: screenshot, fullPage: false, omitBackground: true });
  await testInfo.attach('live-broadcast-1920x1080.png', { path: screenshot, contentType: 'image/png' });
});

test('OBS overlay withholds partial assignments during vote collection', async ({ page }) => {
  const collecting = {
    ...fixedVote,
    state: {
      ...fixedVote.state,
      phaseDetail: 'Сбор голосов',
      vote: { ...fixedVote.state.vote, published: false, counts: {}, assignments: {}, outcome: null },
    },
  };
  await page.route('**/api/public/broadcast/e2e-token', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(collecting) });
  });

  await page.goto('/broadcast/e2e-token');
  await expect(page.getByText('Идёт голосование')).toBeVisible();
  await expect(page.getByText('Результат и голоса игроков появятся после фиксации ведущим')).toBeVisible();
  await expect(page.locator('.live-broadcast-voters span')).toHaveCount(0);
});
