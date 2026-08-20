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

const attachViewport = async (page, testInfo, name) => {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

test.describe('Organizer events cabinet migration', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps event states colourful while using canonical cabinet controls and cards', async ({ page }, testInfo) => {
    await page.goto('/e2e/crm-evenings.html');
    await page.evaluate(() => document.fonts.ready);

    const calendar = page.getByTestId('crm-events-calendar');
    await expect(calendar).toBeVisible();
    expect(await calendar.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('24px');

    const allFilter = page.getByTestId('crm-calendar-filter-all');
    await expect(allFilter).toBeVisible();
    const filterTreatment = await allFilter.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(filterTreatment.background).toBe('rgb(255, 255, 255)');
    expect(filterTreatment.color).toBe('rgb(9, 10, 13)');

    const segmented = page.locator('[data-slot="segmented-control"]');
    await expect(segmented).toBeVisible();
    const tabs = segmented.locator('button');
    expect(await tabs.nth(0).evaluate((element) => element.getBoundingClientRect().height)).toBe(40);
    await expect(tabs.nth(0)).toHaveAttribute('aria-current', 'page');

    await expectNoHorizontalOverflow(page, 'calendar');
    await attachViewport(page, testInfo, 'crm-events-calendar.png');

    const hero = page.getByTestId('crm-evenings-hero');
    await hero.scrollIntoViewIfNeeded();
    await expect(hero).toBeVisible();
    expect(await hero.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('28px');

    const newEvening = page.getByTestId('crm-new-evening');
    const primaryTreatment = await newEvening.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    expect(primaryTreatment.background).toBe('rgb(255, 255, 255)');
    expect(primaryTreatment.color).toBe('rgb(9, 10, 13)');

    const draft = page.getByTestId('crm-evening-draft');
    const active = page.getByTestId('crm-evening-active');
    const planned = page.getByTestId('crm-evening-planned');
    await expect(draft).toBeVisible();
    await expect(active).toBeVisible();
    await expect(planned).toBeVisible();
    for (const card of [draft, active, planned]) {
      expect(await card.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('24px');
    }

    const statusBackgrounds = await Promise.all([draft, active, planned].map((card) => card.locator('span').first().evaluate((element) => getComputedStyle(element).backgroundColor)));
    expect(new Set(statusBackgrounds).size).toBe(3);

    await active.getByRole('button', { name: /Открыть вечер/ }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.openEvening)).toBe('active');

    await expectNoHorizontalOverflow(page, 'event list');
    await hero.scrollIntoViewIfNeeded();
    await attachViewport(page, testInfo, 'crm-events-list.png');
  });
});
