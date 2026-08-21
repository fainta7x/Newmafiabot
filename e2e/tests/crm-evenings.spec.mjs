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

test.describe('Organizer events mobile workflow', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('separates current work, future plans, history and the calendar', async ({ page }, testInfo) => {
    await page.goto('/e2e/crm-evenings.html');
    await page.evaluate(() => document.fonts.ready);

    await expect(page.getByRole('heading', { name: 'События', exact: true })).toBeVisible();
    await expect(page.getByTestId('crm-new-evening')).toBeVisible();
    await expect(page.getByTestId('crm-events-calendar')).toHaveCount(0);

    const typeTabs = page.getByRole('navigation', { name: 'Типы событий' });
    await expect(typeTabs.getByRole('button', { name: 'Игровые вечера', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(typeTabs.getByRole('button', { name: 'Турниры', exact: true })).toBeVisible();

    const timeTabs = page.getByRole('navigation', { name: 'Период событий' });
    await expect(timeTabs.getByRole('button', { name: 'Актуальное', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(timeTabs.getByRole('button', { name: /Будущее/ })).toBeVisible();
    await expect(timeTabs.getByRole('button', { name: 'История', exact: true })).toBeVisible();

    const current = page.getByTestId('crm-events-current');
    await expect(current).toBeVisible();
    await expect(current.getByTestId('crm-evening-active')).toBeVisible();
    await expect(current.getByText('Идёт сейчас', { exact: true })).toBeVisible();
    await expect(current.getByTestId('crm-events-next')).toContainText('Вечер для новичков');
    await expect(current.getByTestId('crm-events-stale-drafts')).toContainText('Черновики требуют решения');
    await expect(page.getByTestId('crm-evening-later')).toHaveCount(0);
    await expect(page.getByTestId('crm-evening-completed')).toHaveCount(0);
    await expectNoHorizontalOverflow(page, 'current events');
    await attachViewport(page, testInfo, 'crm-events-current.png');

    await current.getByTestId('crm-evening-active').getByRole('button', { name: /Открыть вечер/ }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.openEvening)).toBe('active');

    await timeTabs.getByRole('button', { name: /Будущее/ }).click();
    const future = page.getByTestId('crm-events-future');
    await expect(future).toBeVisible();
    await expect(future.getByTestId('crm-evening-later')).toBeVisible();
    await expect(page.getByTestId('crm-evening-active')).toHaveCount(0);
    await expect(page.getByTestId('crm-evening-completed')).toHaveCount(0);
    await expect(future.getByRole('button', { name: '+ След. пятница', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'future events');
    await attachViewport(page, testInfo, 'crm-events-future.png');

    await timeTabs.getByRole('button', { name: 'История', exact: true }).click();
    const history = page.getByTestId('crm-events-history');
    await expect(history).toBeVisible();
    await expect(history.getByTestId('crm-evening-completed')).toContainText('Прошлый клубный вечер');
    await expect(history.getByTestId('crm-evening-completed')).toContainText('3800 ₽');
    await expect(page.getByTestId('crm-evening-active')).toHaveCount(0);
    await expectNoHorizontalOverflow(page, 'event history');
    await attachViewport(page, testInfo, 'crm-events-history.png');

    const calendarButton = page.getByRole('button', { name: 'Календарь', exact: true });
    expect(await calendarButton.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await calendarButton.click();
    const calendar = page.getByTestId('crm-events-calendar');
    await expect(calendar).toBeVisible();
    await expect(page.getByTestId('crm-calendar-compact')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'calendar requested');

    const calendarToggle = page.getByRole('button', { name: /Календарь клуба.*Месяц/ });
    await calendarToggle.click();
    const expanded = page.getByTestId('crm-calendar-expanded');
    await expect(expanded).toBeVisible();
    expect(await expanded.getByRole('button', { name: 'Предыдущий месяц' }).evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await expanded.getByRole('button', { name: 'Следующий месяц' }).evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await attachViewport(page, testInfo, 'crm-events-calendar.png');
  });
});
