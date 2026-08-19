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

  test('uses warm day hierarchy and white generic progress action', async ({ page }, testInfo) => {
    await page.goto('/e2e/live-game-cabinet.html');
    await page.evaluate(() => document.fonts.ready);

    const hud = page.getByTestId('live-judge-hud');
    await expect(hud).toBeVisible();
    const hudTreatment = await hud.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, radius: style.borderRadius, border: style.borderTopColor };
    });
    expect(hudTreatment.background).toMatch(/rgba?\(255, 255, 255, 0\.04/);
    expect(hudTreatment.radius).toBe('20px');
    expect(hudTreatment.border).toBe('rgba(255, 255, 255, 0.1)');

    const phase = hud.locator('.live-judge-hud__phase');
    await expect(phase).toContainText('Нулевой круг');
    const dayPhaseColor = await phase.evaluate((element) => getComputedStyle(element).color);
    expect(dayPhaseColor).toBe('rgb(232, 185, 94)');

    const primary = hud.locator('.live-judge-hud__primary');
    await expect(primary).toContainText('К голосованию');
    const primaryTreatment = await primary.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(primaryTreatment.background).toBe('rgb(255, 255, 255)');
    expect(primaryTreatment.color).toBe('rgb(9, 10, 13)');

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
