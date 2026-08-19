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

test.describe('Player more hub cabinet palette', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('uses restrained distinct semantic colours without changing navigation behavior', async ({ page }, testInfo) => {
    await page.goto('/e2e/player-more.html');
    await page.evaluate(() => document.fonts.ready);

    const profile = page.getByTestId('more-profile-card');
    const club = page.getByTestId('more-club-card');
    const payments = page.getByTestId('more-payments-card');
    const conduct = page.getByTestId('more-conduct-row');

    await expect(profile).toBeVisible();
    await expect(club).toBeVisible();
    await expect(payments).toBeVisible();
    await expect(conduct).toBeVisible();

    const profileTreatment = await profile.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundImage: style.backgroundImage, radius: style.borderRadius };
    });
    expect(profileTreatment.backgroundImage).toContain('linear-gradient');
    expect(profileTreatment.radius).toBe('28px');

    const cardTreatments = await Promise.all([club, payments].map((locator) => locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundImage: style.backgroundImage, radius: style.borderRadius };
    })));
    expect(cardTreatments[0].backgroundImage).toContain('linear-gradient');
    expect(cardTreatments[1].backgroundImage).toContain('linear-gradient');
    expect(cardTreatments[0].backgroundImage).not.toBe(cardTreatments[1].backgroundImage);
    expect(cardTreatments[0].radius).toBe('24px');
    expect(cardTreatments[1].radius).toBe('24px');

    await club.click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.lastDestination)).toBe('club');
    await payments.click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.lastDestination)).toBe('payments');

    await expectNoHorizontalOverflow(page);

    const path = testInfo.outputPath('player-more-canonical.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('player-more-canonical.png', { path, contentType: 'image/png' });
  });
});
