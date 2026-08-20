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

const capture = async (page, testInfo, name) => {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

test.describe('Live Game setup hierarchy', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps role setup primary and secondary settings compact on mobile', async ({ page }, testInfo) => {
    await page.goto('/e2e/live-game.html');

    const hero = page.getByTestId('club-game-setup-hero');
    const primary = page.getByTestId('club-game-start-role-deal');
    const tablePreview = page.getByTestId('club-game-table-preview');
    const music = page.getByTestId('club-game-music-settings');
    const recording = page.getByTestId('speech-recording-setup');

    await expect(hero).toBeVisible();
    await expect(primary).toBeVisible();
    await expect(tablePreview).toBeVisible();
    await expect(music).toBeVisible();
    await expect(recording).toBeVisible();
    await expect(music).not.toHaveAttribute('open', '');
    await expect(recording).not.toHaveAttribute('open', '');
    await expect(recording.getByText('Запись речей', { exact: true })).toBeVisible();
    await expect(recording.getByText('Автозапись без захвата Bluetooth', { exact: true })).toBeHidden();

    const heroBox = await hero.boundingBox();
    const primaryBox = await primary.boundingBox();
    const recordingBox = await recording.boundingBox();
    expect(heroBox).not.toBeNull();
    expect(primaryBox).not.toBeNull();
    expect(recordingBox).not.toBeNull();
    expect(heroBox.y).toBeLessThan(primaryBox.y);
    expect(primaryBox.y).toBeLessThan(recordingBox.y);
    expect(primaryBox.height).toBeGreaterThanOrEqual(44);

    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toContain('Два фиксированных трека');
    expect(pageText).not.toContain('Стол готов');
    expect(pageText).not.toContain('🃏');

    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, 'live-game-setup-hierarchy.png');

    await music.locator('summary').click();
    await expect(music).toHaveAttribute('open', '');
    await expect(music.locator('select')).toHaveCount(2);
    await music.locator('summary').click();

    await recording.locator('summary').click();
    await expect(recording).toHaveAttribute('open', '');
    await expect(recording.getByRole('button', { name: 'Включить запись речей', exact: true })).toBeVisible();
    await recording.locator('summary').click();

    await primary.click();
    const intro = page.getByTestId('physical-role-deal-intro');
    const startDeal = page.getByTestId('physical-role-deal-start');
    await expect(intro).toBeVisible();
    await expect(intro.getByText('Подготовьте 10 карт', { exact: true })).toBeVisible();
    const startDealBox = await startDeal.boundingBox();
    expect(startDealBox).not.toBeNull();
    expect(startDealBox.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, 'live-game-role-deal-intro.png');

    await startDeal.click();
    const activeDeal = page.getByTestId('physical-role-deal-active');
    await expect(activeDeal).toBeVisible();
    await expect(activeDeal.getByText('Карту тянет', { exact: true })).toBeVisible();
    await expect(activeDeal.getByText('#1', { exact: true })).toBeVisible();
    const citizenButton = activeDeal.getByRole('button', { name: /Мирный/ }).first();
    const citizenBox = await citizenButton.boundingBox();
    expect(citizenBox).not.toBeNull();
    expect(citizenBox.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, 'live-game-role-deal-active.png');
  });
});
