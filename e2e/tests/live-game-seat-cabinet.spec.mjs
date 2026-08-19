import { expect, test } from '@playwright/test';

const ROLE_SEQUENCE = [
  'Мирный', 'Мафия', 'Мирный', 'Шериф', 'Мирный',
  'Мафия', 'Мирный', 'Дон', 'Мирный', 'Мирный',
];

const tableGrid = (page) => page
  .locator('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]')
  .first();

const seat = (page, slot) => tableGrid(page).locator(`:scope > .live-seat-card[data-seat="${slot}"]`);

const expectNoHorizontalOverflow = async (page, label) => {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    shell: document.querySelector('.evening-live-engine-shell')?.scrollWidth || 0,
    shellClient: document.querySelector('.evening-live-engine-shell')?.clientWidth || 0,
  }));
  expect.soft(metrics.document, `${label}: document overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
  expect.soft(metrics.body, `${label}: body overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
  if (metrics.shellClient > 0) expect.soft(metrics.shell, `${label}: shell overflow`).toBeLessThanOrEqual(metrics.shellClient + 1);
};

const capture = async (page, testInfo, name) => {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

const prepareZeroRound = async (page) => {
  await page.goto('/e2e/live-game.html');
  await page.getByRole('button', { name: /Начать раздачу ролей/ }).click();
  const intro = page.getByText('Подготовьте 10 карт');
  await expect(intro).toBeVisible();
  await intro.locator('xpath=ancestor::section[1]').getByRole('button', { name: 'Начать раздачу', exact: true }).click();
  for (const role of ROLE_SEQUENCE) await page.getByRole('button', { name: new RegExp(role) }).click();
  await page.getByRole('button', { name: /Роли зафиксированы/ }).click();
  await page.getByRole('button', { name: /Договорка · 75с/ }).click();
  await page.getByRole('button', { name: /Вызов шерифа · 10с/i }).click();
  await page.getByRole('button', { name: /Свободная посадка · 40с/ }).click();
  await page.getByRole('button', { name: /Открыть нулевой круг/ }).click();
  await expect(tableGrid(page)).toBeVisible();
};

test.describe('Live Game seat cabinet', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });
  test.setTimeout(90_000);

  test('keeps ten seat identities distinct and makes judge actions readable at one tap', async ({ page }, testInfo) => {
    await prepareZeroRound(page);

    const seatOne = seat(page, 1);
    const seatTwo = seat(page, 2);
    await expect(seatOne).toBeVisible();
    await expect(seatTwo).toBeVisible();

    const cardTreatments = await Promise.all([seatOne, seatTwo].map((locator) => locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        borderColor: style.borderTopColor,
        radius: style.borderRadius,
      };
    })));
    expect(cardTreatments[0].radius).toBe('14px');
    expect(cardTreatments[1].radius).toBe('14px');
    expect(cardTreatments[0].backgroundImage).toContain('linear-gradient');
    expect(cardTreatments[0].backgroundImage).not.toBe(cardTreatments[1].backgroundImage);
    expect(cardTreatments[0].borderColor).not.toBe(cardTreatments[1].borderColor);

    const numberTreatments = await Promise.all([1, 2, 5, 8].map((slot) => page.locator(`.live-seat-number[data-seat="${slot}"]`).evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color, radius: style.borderRadius };
    })));
    expect(new Set(numberTreatments.map((item) => item.background)).size).toBe(4);
    expect(numberTreatments.every((item) => item.radius === '10px')).toBe(true);

    // Between speeches there is nothing to nominate yet, so the table should
    // not visually repeat ten disabled nomination buttons or thirty zero-value badges.
    const inactiveNomination = seatTwo.locator('.live-seat-quick-action--nomination');
    const inactiveTreatment = await inactiveNomination.evaluate((element) => {
      const style = getComputedStyle(element);
      return { opacity: style.opacity, pointerEvents: style.pointerEvents };
    });
    expect(inactiveTreatment.opacity).toBe('0');
    expect(inactiveTreatment.pointerEvents).toBe('none');
    const zeroDiscipline = page.locator('.evening-live-discipline > span[data-count="0"]');
    expect(await zeroDiscipline.count()).toBeGreaterThan(0);
    await expect(zeroDiscipline.first()).toBeHidden();

    const quickActions = seatOne.locator('.live-seat-quick-action');
    expect(await quickActions.count()).toBeGreaterThanOrEqual(2);
    const seatBox = await seatOne.boundingBox();
    expect(seatBox).not.toBeNull();
    for (let index = 0; index < await quickActions.count(); index += 1) {
      const box = await quickActions.nth(index).boundingBox();
      expect(box).not.toBeNull();
      expect.soft(box.x).toBeGreaterThanOrEqual(seatBox.x - 1);
      expect.soft(box.x + box.width).toBeLessThanOrEqual(seatBox.x + seatBox.width + 1);
    }

    await expectNoHorizontalOverflow(page, 'seat table');
    await capture(page, testInfo, 'live-game-seat-cabinet.png');

    // The action returns as soon as the judge starts the next speech. The
    // speaking seat must also become the strongest warm focus on the table.
    await page.getByRole('button', { name: /Речь #1/ }).click();
    await expect(seatTwo.locator('.live-seat-quick-action--nomination')).toBeVisible();
    const speakingTreatment = await seatOne.evaluate((element) => {
      const style = getComputedStyle(element);
      return { border: style.borderTopColor, shadow: style.boxShadow, backgroundImage: style.backgroundImage };
    });
    expect(speakingTreatment.border).toBe('rgba(232, 185, 94, 0.86)');
    expect(speakingTreatment.shadow).toContain('232, 185, 94');
    expect(speakingTreatment.backgroundImage).toContain('232, 185, 94');
    await capture(page, testInfo, 'live-game-speaking-focus.png');

    await seat(page, 6).click();
    const sheet = page.locator('.live-player-action-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('#6 · Игрок 6');
    const sheetTreatment = await sheet.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, radius: style.borderTopLeftRadius, border: style.borderTopColor };
    });
    expect(sheetTreatment.background).toBe('rgb(18, 19, 24)');
    // Telegram's host adapter owns the compact mobile-sheet geometry. Stage 4.2
    // changes the material/palette, not that already-stable radius.
    expect(sheetTreatment.radius).toBe('18px');
    expect(sheetTreatment.border).toBe('rgba(255, 255, 255, 0.1)');

    const actionButtons = sheet.locator(':scope > .grid.grid-cols-2 > button');
    expect(await actionButtons.count()).toBeGreaterThanOrEqual(8);
    for (let index = 0; index < await actionButtons.count(); index += 1) {
      const height = await actionButtons.nth(index).evaluate((element) => element.getBoundingClientRect().height);
      expect.soft(height, `action ${index + 1} height`).toBeGreaterThanOrEqual(50);
    }

    const regularFoul = sheet.getByRole('button', { name: '+ Обычный фол', exact: true });
    const majorTech = sheet.getByRole('button', { name: 'Большой тех', exact: true });
    const ppk = sheet.getByRole('button', { name: 'ППК', exact: true });
    const semanticBackgrounds = await Promise.all([regularFoul, majorTech, ppk].map((locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor)));
    expect(new Set(semanticBackgrounds).size).toBe(3);

    await capture(page, testInfo, 'live-game-player-actions-cabinet.png');

    await regularFoul.click();
    await expect(sheet).toBeHidden();
    await expect(page.locator('.evening-live-discipline > span[data-count="1"]').first()).toBeVisible();
    await seat(page, 6).click();
    await expect(sheet).toBeVisible();
    const foulStat = sheet.locator('.grid.grid-cols-3 > div').first();
    await expect(foulStat).toContainText('1');

    await expectNoHorizontalOverflow(page, 'player actions');
  });
});