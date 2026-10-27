import { test, expect } from '@playwright/test';

// The page of one finished game: result first, the viewer's own game, what mattered, rosters by team, then the story.
for (const width of [360, 390]) test(`game page reads top to bottom at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 713 });
  await page.goto('/e2e/player-game-detail.html?before=1');
  await expect(page.getByTestId('game-hero')).toContainText('Победа красных');
  await page.screenshot({path:testInfo.outputPath(`game-before-${width}.png`),fullPage:true});
  await page.goto('/e2e/player-game-detail.html');
  await expect(page.getByTestId('game-hero')).toContainText('Победа красных');
  await expect(page.getByTestId('game-mine')).toContainText('Моя игра');
  await expect(page.getByText('Главное в игре')).toBeVisible();
  await expect(page.getByText('Составы и баллы')).toBeVisible();
  const roster = page.getByRole('region', { name: 'Составы и баллы', exact: true });
  await expect(page.locator('[data-testid^="game-player-"]')).toHaveCount(10);
  expect((await roster.boundingBox()).y + (await roster.boundingBox()).height).toBeLessThanOrEqual(713);
  await page.screenshot({ path: testInfo.outputPath(`game-overview-${width}.png`) });
  await page.getByTestId('game-key-moments').locator(':scope > summary').click();
  await expect(page.getByText('Знак с очень длинным ником игрока', { exact: false }).first()).toBeVisible();
  await page.getByTestId('game-full-protocol').locator(':scope > summary').click();
  await expect(page.getByText('Ход игры')).toBeVisible();
  await expect(page.getByLabel('Кто в кого голосовал')).toContainText('#2 Алоэ');
  await page.getByTestId('game-personal-stats').locator(':scope > summary').click();
  await expect(page.getByTestId('game-personal-stats')).toContainText('100%');
  await page.getByTestId('game-score-sheet').screenshot({path:testInfo.outputPath(`game-analysis-${width}.png`)});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Every row is a touch target; opening one shows where the points came from.
  const heights = await page.locator('summary:visible').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThanOrEqual(12);
  expect(heights.every((height) => height >= 44)).toBe(true);
  await expect(page.getByTestId('game-table-scene')).toHaveCount(0);
  await expect(page.getByTestId('game-action-journal')).toBeVisible();
  for (const row of await page.locator('[data-testid^="game-player-"] > summary').all()) {
    const rowBox = await row.boundingBox();
    expect(rowBox.x).toBeGreaterThanOrEqual(0);
    expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(width);
    for (const child of await row.locator(':scope > *').all()) {
      const box = await child.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(rowBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
    }
  }
  await page.getByTestId('game-player-3').locator('summary').click();
  await expect(page.getByTestId('game-player-3')).toContainText('Из чего баллы');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The whole page in one picture for the reviewer: grow the viewport to the content.
  const full = await page.evaluate(() => Math.ceil(document.querySelector('main').getBoundingClientRect().height) + 40);
  await page.setViewportSize({ width, height: Math.min(full, 6000) });
  await page.screenshot({ path: testInfo.outputPath(`game-page-${width}.png`) });
});

for (const width of [360,390]) test(`evening recap is one result sheet at ${width}px`, async ({page},testInfo) => {
  await page.setViewportSize({width,height:713});
  await page.goto('/e2e/player-game-detail.html?screen=recap&before=1');
  await expect(page.getByTestId('evening-result-art')).toBeVisible();
  await page.setViewportSize({width,height:1600});
  await page.screenshot({path:testInfo.outputPath(`recap-before-${width}.png`),fullPage:true});
  await page.setViewportSize({width,height:713});
  await page.goto('/e2e/player-game-detail.html?screen=recap');
  const sheet=page.getByTestId('evening-result-art');
  await expect(sheet.getByText('Пятничный клубный вечер')).toBeVisible();
  await expect(sheet.getByText('Игрок вечера',{exact:true})).toBeVisible();
  await expect(sheet.getByRole('button',{name:/Игра №11/})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const targets=await sheet.locator('button,summary').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
  expect(targets.every(height=>height>=44)).toBe(true);
  await page.setViewportSize({width,height:1600});
  await page.screenshot({path:testInfo.outputPath(`recap-after-${width}.png`),fullPage:true});
  await sheet.getByRole('button',{name:/Игра №11/}).click();
  expect(await page.locator('body').getAttribute('data-opened-game')).toBe('club:11');
});

for (const width of [360, 390]) test(`result and speech retry retain protocol context at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/e2e/player-game-detail.html?screen=flow&failGame=1&failClips=1');
  await expect(page.getByRole('alert')).toContainText('Игра временно недоступна');
  await expect(page.getByRole('button', { name: /Replay игры/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  const protocol = page.getByTestId('game-full-protocol');
  await protocol.locator('summary').first().click();
  await page.getByTestId('game-player-3').locator('summary').first().click();
  const replay = page.getByRole('button', { name: /Replay игры/ });
  await replay.scrollIntoViewIfNeeded();
  const readPosition = () => page.getByTestId('game-score-sheet').evaluate(sheet => { const result = [window.scrollY]; for (let p = sheet.parentElement; p; p = p.parentElement) result.push(p.scrollTop); return result; });
  const position = await readPosition();
  expect(Math.max(...position)).toBeGreaterThan(0);
  await replay.click();
  await expect(page.getByText('Записи речей временно недоступны')).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Шаг старой хронологии' });
  await slider.fill('2');
  await page.getByRole('button', { name: 'Повторить загрузку речей' }).click();
  await expect(page.getByText('Для этой игры сохранённых речей нет.')).toBeVisible();
  await expect(slider).toHaveValue('2');
  await page.goBack();
  await expect(protocol).toHaveAttribute('open', '');
  await expect(page.getByTestId('game-player-3')).toHaveAttribute('open', '');
  await expect.poll(async () => (await readPosition()).map((top, index) => Math.abs(top - position[index]))).toEqual(position.map(() => 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
