import { test, expect } from '@playwright/test';

const expectContainedAction = async (locator, minHeight = 44) => {
  await expect(locator).toBeInViewport();
  const fits = await locator.evaluate((el, expectedHeight) => {
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
    return r.height >= expectedHeight;
  }, minHeight);
  expect(fits).toBe(true);
};

for (const width of [360, 390]) {
  test(`mobile work surfaces ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 360 ? 640 : 713 });
    await page.goto('/e2e/crm-evening-roster.html');
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
    page.on('dialog', async (dialog) => { await dialog.accept(); });
    await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
    await page.getByRole('button', { name: 'Перейти к голосованию', exact: true }).click();
    await expect(page.locator('.live-judge-hud__phase')).toHaveText('Голосование · кандидат #3');
    await expect(page.locator('.live-judge-hud__context')).toContainText('Нулевой круг');
    await expect(page.locator('.live-judge-hud__context')).toContainText('Раунд 1');
    await expect(page.locator('.live-judge-voting-focus__candidate')).toContainText('Текущий кандидат#3');

    for (let n = 1; n <= 5; n++) await page.locator(`.live-seat-card[data-seat="${n}"]`).click();
    const voteCount = page.locator('.live-judge-vote-summary .live-judge-stat').filter({ hasText: 'Назначено' }).locator('.live-judge-stat__value');
    await expect(voteCount).toHaveText('5');
    await expect(page.locator('.live-judge-voter-state')).toContainText('#1 · #2 · #3 · #4 · #5');

    const undoVote = page.getByRole('button', { name: 'Отменить последний голос', exact: true });
    await expect(undoVote).toBeEnabled();
    await undoVote.click();
    await expect(voteCount).toHaveText('4');
    await page.locator('.live-seat-card[data-seat="5"]').click();
    await expect(voteCount).toHaveText('5');

    const nextCandidate = page.getByRole('button', { name: 'Следующий кандидат', exact: true });
    await expectContainedAction(nextCandidate);
    const collectingBodyFits = await page.locator('.live-judge-hud__body').evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
    expect(collectingBodyFits).toBe(true);
    const labelFontSize = await page.locator('.live-judge-vote-summary .live-judge-stat__label').first().evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(labelFontSize).toBeGreaterThanOrEqual(12);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('voting-collecting.png') });

    await nextCandidate.click();
    await expect(page.locator('.live-judge-hud__phase')).toHaveText('Голосование · кандидат #4');
    await expect(page.locator('.live-judge-voter-state')).toContainText('Остаток уйдёт к #4 при подведении итога');
    const finishVoting = page.getByRole('button', { name: 'Завершить голосование', exact: true });
    await expectContainedAction(finishVoting);
    await finishVoting.click();
    await page.getByRole('button', { name: 'Начать речи по 30 секунд', exact: true }).click();
    await page.getByRole('combobox', { name: 'Быстрые действия игрока' }).selectOption({ label: '#2 Игрок 2' });
    await page.getByRole('button', { name: '+ Обычный фол', exact: true }).click();
    await expect(page.getByLabel('Фолы 1, малые техфолы 0, большие техфолы 0')).toBeVisible();
    const nextSpeech = page.getByRole('button', { name: 'Следующая речь', exact: true });
    await expectContainedAction(nextSpeech);
    await page.screenshot({ path: info.outputPath('revote-speech.png') });
    await nextSpeech.click();
    await page.getByRole('button', { name: 'Начать переголосование', exact: true }).click();
    await expect(page.getByText('Переголосование 1', { exact: true })).toBeVisible();
  });
}
