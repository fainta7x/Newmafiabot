import { expect, test } from '@playwright/test';

const expectNoHorizontalOverflow = async (page) => {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect.soft(metrics.document).toBeLessThanOrEqual(metrics.viewport + 1);
  expect.soft(metrics.body).toBeLessThanOrEqual(metrics.viewport + 1);
};

test.describe('Player rating cabinet palette', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps semantic colour hierarchy without changing mobile geometry', async ({ page }, testInfo) => {
    await page.goto('/e2e/player-rating.html');
    await page.evaluate(() => document.fonts.ready);

    const selfCard = page.getByTestId('rating-self-card');
    const selfRow = page.getByTestId('rating-self-row');
    await expect(selfCard).toBeVisible();
    await expect(selfCard).toContainText('#4');
    await expect(selfCard).toContainText('1542');
    await expect(selfRow).toBeVisible();

    const featureTreatment = await selfCard.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundImage: style.backgroundImage, radius: style.borderRadius };
    });
    expect(featureTreatment.backgroundImage).toContain('linear-gradient');
    expect(featureTreatment.radius).toBe('28px');

    const selfRowBackground = await selfRow.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(selfRowBackground).toContain('225, 52, 88');

    const firstPlace = page.getByText('1', { exact: true }).first();
    const firstPlaceBackground = await firstPlace.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(firstPlaceBackground).not.toBe(selfRowBackground);

    await expectNoHorizontalOverflow(page);

    const path = testInfo.outputPath('player-rating-canonical.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('player-rating-canonical.png', { path, contentType: 'image/png' });
  });
});
