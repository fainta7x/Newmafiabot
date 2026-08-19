import { expect, test } from '@playwright/test';

const tableGrid = (page) => page
  .locator('.evening-live-engine-shell div[class*="grid-cols-2"][class*="md:grid-cols-5"]')
  .first();

const prepareRecoveredDay = async (page) => {
  await page.goto('/e2e/live-game.html?mode=recovery');
  await expect(page.getByText(/Найдена незавершённая игра · 18:00/)).toBeVisible();
  await page.getByRole('button', { name: 'Восстановить', exact: true }).click();
  await expect(tableGrid(page)).toBeVisible();
  await expect(page.getByText('Прерванная игра восстановлена', { exact: true })).toBeVisible();
};

const cssAlpha = (value) => {
  const slash = String(value).match(/\/\s*([0-9.]+)\s*\)?$/);
  if (slash) return Number(slash[1]);
  const rgba = String(value).match(/rgba\([^)]*,\s*([0-9.]+)\)$/);
  if (rgba) return Number(rgba[1]);
  return 1;
};

const classTokens = async (locator) => (await locator.getAttribute('class') || '').split(/\s+/).filter(Boolean);

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

test.describe('Live Game utility cabinet', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });
  test.setTimeout(90_000);

  test('keeps secondary utilities collapsed until the judge asks for them', async ({ page }, testInfo) => {
    await prepareRecoveredDay(page);

    const stateButton = page.getByTestId('live-state-button');
    await expect(stateButton).toBeVisible();
    const stateButtonBox = await stateButton.boundingBox();
    expect(stateButtonBox).not.toBeNull();
    expect(stateButtonBox.width).toBeLessThanOrEqual(30);
    await expect(stateButton.locator('span')).toBeHidden();

    const panel = page.getByTestId('live-events-panel');
    await panel.scrollIntoViewIfNeeded();
    await expect(panel).toBeVisible();
    const panelTreatment = await panel.evaluate((element) => {
      const style = getComputedStyle(element);
      return { radius: style.borderRadius, background: style.backgroundColor, border: style.borderTopColor };
    });
    expect(panelTreatment.radius).toBe('24px');
    expect(cssAlpha(panelTreatment.background)).toBeCloseTo(0.04, 3);
    expect(cssAlpha(panelTreatment.border)).toBeCloseTo(0.1, 3);

    const latest = page.getByTestId('live-events-latest');
    const undo = page.getByTestId('live-events-undo');
    await expect(latest).toBeVisible();
    await expect(latest).toContainText('E2E: сохранённая игра перед восстановлением.');
    await expect(undo).toBeVisible();
    await expect(undo).toHaveAttribute('aria-label', 'Отменить последнее событие');

    const copy = page.getByTestId('live-copy-protocol');
    const toggle = page.getByTestId('live-events-toggle');
    const details = page.getByTestId('live-events-details');
    await expect(copy).toBeVisible();
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(details).toHaveCount(0);
    await expect(page.getByTestId('live-protocol-notes')).toHaveCount(0);

    const collapsedHeight = await panel.evaluate((element) => element.getBoundingClientRect().height);
    expect(collapsedHeight).toBeLessThanOrEqual(90);
    await expectNoHorizontalOverflow(page, 'collapsed events panel');
    await capture(page, testInfo, 'live-game-utilities-collapsed.png');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('live-events-details')).toBeVisible();

    const filters = page.getByTestId('live-events-filters');
    const all = filters.getByRole('button', { name: /Все/ });
    const day = filters.getByRole('button', { name: 'Дни', exact: true });
    const night = filters.getByRole('button', { name: 'Ночи', exact: true });
    expect(await all.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');

    await day.click();
    expect(await classTokens(day)).toContain('text-amber-100');
    expect(await classTokens(day)).toContain('border');
    expect(await classTokens(all)).not.toContain('bg-white');

    await night.click();
    expect(await classTokens(night)).toContain('text-violet-100');
    expect(await classTokens(night)).toContain('border');
    expect(await classTokens(day)).not.toContain('text-amber-100');

    const notes = page.getByTestId('live-protocol-notes');
    await expect(notes).toBeVisible();
    expect(await notes.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page, 'expanded events panel');
    await capture(page, testInfo, 'live-game-utilities-expanded.png');

    await stateButton.click();
    const sheet = page.getByTestId('live-state-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Текущее состояние игры', { exact: true })).toBeVisible();
    const sheetTreatment = await sheet.evaluate((element) => {
      const style = getComputedStyle(element);
      return { radius: style.borderTopLeftRadius, background: style.backgroundColor, border: style.borderTopColor };
    });
    expect(sheetTreatment.radius).toBe('24px');
    expect(sheetTreatment.background).toBe('rgb(18, 19, 24)');
    expect(cssAlpha(sheetTreatment.border)).toBeCloseTo(0.1, 3);

    const phaseCard = page.getByTestId('live-state-phase');
    const nextCard = page.getByTestId('live-state-next');
    await expect(phaseCard).toBeVisible();
    await expect(nextCard).toBeVisible();
    const phaseBackground = await phaseCard.evaluate((element) => getComputedStyle(element).backgroundColor);
    const nextBackground = await nextCard.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(phaseBackground).not.toBe(nextBackground);

    await expectNoHorizontalOverflow(page, 'state sheet');
    await capture(page, testInfo, 'live-game-state-sheet-cabinet.png');
  });
});
