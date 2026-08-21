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

test.describe('Organizer overview cabinet migration', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps the Today screen compact while preserving the actionable evening summary', async ({ page }, testInfo) => {
    await page.goto('/e2e/crm-overview.html');
    await page.evaluate(() => document.fonts.ready);

    const heading = page.getByRole('heading', { name: 'Сегодня', exact: true });
    await expect(heading).toBeVisible();
    const headingTreatment = await heading.evaluate((element) => {
      const style = getComputedStyle(element);
      return { fontSize: style.fontSize, fontWeight: style.fontWeight, letterSpacing: style.letterSpacing };
    });
    expect(headingTreatment.fontSize).toBe('24px');
    expect(headingTreatment.fontWeight).toBe('600');
    expect(['normal', '0px']).toContain(headingTreatment.letterSpacing);
    await expect(page.getByText('Organizer 2.0', { exact: true })).toHaveCount(0);

    const eventHeading = page.getByRole('heading', { name: 'Пятничный клубный вечер' });
    await expect(eventHeading).toBeVisible();
    const eventSection = eventHeading.locator('xpath=ancestor::section[1]');
    await expect(eventSection).toBeVisible();
    expect(await eventSection.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('24px');

    const sectionBackground = await eventSection.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(sectionBackground).not.toBe('rgba(0, 0, 0, 0)');

    const expectedMetric = page.getByText('ожидаем', { exact: true }).locator('xpath=..');
    await expect(expectedMetric).toBeVisible();
    expect(await expectedMetric.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0.2)');

    await expectNoHorizontalOverflow(page);

    const path = testInfo.outputPath('crm-overview-canonical.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('crm-overview-canonical.png', { path, contentType: 'image/png' });
  });
});
