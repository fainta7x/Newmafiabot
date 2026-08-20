import { expect, test } from '@playwright/test';

const expectNoHorizontalOverflow = async (page, label) => {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect.soft(metrics.document, `${label}: document overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
  expect.soft(metrics.body, `${label}: body overflow`).toBeLessThanOrEqual(metrics.viewport + 1);
};

const capture = async (page, testInfo, name) => {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

test.describe('Live Game cabinet shell', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('uses warm day hierarchy, one nomination readout and white generic progress action', async ({ page }, testInfo) => {
    await page.goto('/e2e/live-game-cabinet.html');
    await page.evaluate(() => document.fonts.ready);

    const hud = page.getByTestId('live-judge-hud');
    await expect(hud).toBeVisible();
    const hudTreatment = await hud.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        radius: style.borderRadius,
        border: style.borderTopColor,
      };
    });
    expect(hudTreatment.background).toMatch(/rgba?\(255, 255, 255, 0\.04/);
    expect(hudTreatment.backgroundImage).toContain('linear-gradient');
    expect(hudTreatment.backgroundImage).toContain('232, 185, 94');
    expect(hudTreatment.radius).toBe('20px');
    expect(hudTreatment.border).toBe('rgba(232, 185, 94, 0.2)');

    const phase = hud.locator('.live-judge-hud__phase');
    await expect(phase).toContainText('Нулевой круг');
    const phaseTreatment = await phase.evaluate((element) => {
      const style = getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor, radius: style.borderRadius };
    });
    expect(phaseTreatment.color).toBe('rgb(232, 185, 94)');
    expect(phaseTreatment.background).toBe('rgba(232, 185, 94, 0.11)');
    expect(phaseTreatment.radius).toBe('999px');

    const duplicatedNominationChip = hud.locator('.live-judge-hud__body .live-judge-hud__meta');
    await expect(duplicatedNominationChip).toBeHidden();

    const summary = hud.locator('.live-judge-hud__summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Выставлены: #3 · #7');
    const aliveCounter = summary.getByText(/Живых:/);
    await expect(aliveCounter).toBeHidden();

    const primary = hud.locator('.live-judge-hud__primary');
    await expect(primary).toContainText('К голосованию');
    const primaryTreatment = await primary.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(primaryTreatment.background).toBe('rgb(255, 255, 255)');
    expect(primaryTreatment.color).toBe('rgb(9, 10, 13)');
    const primaryBox = await primary.boundingBox();
    expect(primaryBox).not.toBeNull();
    expect(primaryBox.height).toBeGreaterThanOrEqual(44);

    await expectNoHorizontalOverflow(page, 'day center');
    await capture(page, testInfo, 'live-game-cabinet-day.png');
  });

  test('switches the center hierarchy to violet at night without changing controls', async ({ page }, testInfo) => {
    await page.goto('/e2e/live-game-cabinet.html?phase=night');
    await page.evaluate(() => document.fonts.ready);

    const hud = page.getByTestId('live-judge-hud');
    const nightStatus = page.getByTestId('live-game-night-status');
    await expect(nightStatus).toBeVisible();
    await expect(nightStatus).toContainText('Отстрел');

    const hudTreatment = await hud.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundImage: style.backgroundImage, border: style.borderTopColor };
    });
    expect(hudTreatment.backgroundImage).toContain('167, 139, 250');
    expect(hudTreatment.border).toBe('rgba(167, 139, 250, 0.24)');

    const phase = hud.locator('.live-judge-hud__phase');
    await expect(phase).toContainText('Ночь 1');
    expect(await phase.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(196, 181, 253)');

    const timer = hud.locator('.live-judge-timer__time');
    expect(await timer.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(196, 181, 253)');

    const timerPrimary = hud.locator('.live-judge-timer__button--primary');
    const timerPrimaryTreatment = await timerPrimary.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(timerPrimaryTreatment.background).toBe('rgb(255, 255, 255)');
    expect(timerPrimaryTreatment.color).toBe('rgb(9, 10, 13)');

    await expectNoHorizontalOverflow(page, 'night center');
    await capture(page, testInfo, 'live-game-cabinet-night.png');
  });
});
