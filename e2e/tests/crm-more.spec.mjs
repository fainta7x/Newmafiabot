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

test.describe('Organizer CRM secondary tools', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps frequent tools visible and rare service controls collapsed on mobile', async ({ page }, testInfo) => {
    await page.goto('/e2e/crm-more.html');
    await page.evaluate(() => document.fonts.ready);

    const heading = page.getByRole('heading', { name: 'Ещё', exact: true });
    await expect(heading).toBeVisible();
    const headingTreatment = await heading.evaluate((element) => {
      const style = getComputedStyle(element);
      return { fontSize: style.fontSize, fontWeight: style.fontWeight };
    });
    expect(headingTreatment.fontSize).toBe('21px');
    expect(headingTreatment.fontWeight).toBe('600');

    const tasks = page.getByTestId('crm-more-tasks');
    const analytics = page.getByTestId('crm-more-analytics');
    const commerce = page.getByTestId('crm-more-commerce');
    await expect(tasks).toBeVisible();
    await expect(analytics).toBeVisible();
    await expect(commerce).toBeVisible();

    const iconTreatments = await Promise.all([tasks, analytics, commerce].map((locator) => locator.locator('span').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    })));
    expect(new Set(iconTreatments.map((item) => item.background)).size).toBe(3);
    expect(new Set(iconTreatments.map((item) => item.color)).size).toBe(3);

    const group = tasks.locator('xpath=..');
    await expect(group).toBeVisible();
    expect(await group.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('20px');

    const serviceToggle = page.getByRole('button', { name: /Настройки и обслуживание/ });
    await expect(serviceToggle).toBeVisible();
    await expect(page.getByTestId('crm-more-data')).toHaveCount(0);
    await serviceToggle.click();
    await expect(page.getByTestId('crm-more-service-tools')).toBeVisible();
    await expect(page.getByTestId('crm-more-data')).toBeVisible();
    await serviceToggle.click();

    const bottomNav = page.locator('.organizer-bottom-nav');
    const activeNav = page.getByTestId('crm-nav-more');
    await expect(bottomNav).toBeVisible();
    await expect(activeNav).toBeVisible();
    expect(await activeNav.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(52);

    const navTreatment = await bottomNav.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderTopColor };
    });
    expect(navTreatment.background).toBe('rgba(11, 12, 16, 0.95)');
    expect(navTreatment.border).toBe('rgba(255, 255, 255, 0.1)');

    const activeTreatment = await activeNav.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(activeTreatment).not.toBe('rgba(0, 0, 0, 0)');
    const legacyIndicator = activeNav.locator('span.absolute');
    expect(await legacyIndicator.evaluate((element) => getComputedStyle(element).display)).toBe('none');

    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    await expect(heading).toBeVisible();

    const path = testInfo.outputPath('crm-more-canonical.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('crm-more-canonical.png', { path, contentType: 'image/png' });
  });
});
