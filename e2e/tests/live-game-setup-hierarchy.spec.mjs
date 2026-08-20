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

test.describe('Live Game setup hierarchy', () => {
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('keeps role setup primary and speech recording optional on mobile', async ({ page }, testInfo) => {
    await page.goto('/e2e/live-game.html');

    const hero = page.getByTestId('club-game-setup-hero');
    const recording = page.getByTestId('speech-recording-setup');
    await expect(hero).toBeVisible();
    await expect(recording).toBeVisible();
    await expect(recording).not.toHaveAttribute('open', '');
    await expect(recording.getByText('Запись речей', { exact: true })).toBeVisible();
    await expect(recording.getByText('Автозапись без захвата Bluetooth', { exact: true })).toBeHidden();

    const heroBox = await hero.boundingBox();
    const recordingBox = await recording.boundingBox();
    expect(heroBox).not.toBeNull();
    expect(recordingBox).not.toBeNull();
    expect(heroBox.y).toBeLessThan(recordingBox.y);
    expect(heroBox.y).toBeLessThan(90);

    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toContain('🃏');
    expect(pageText).not.toContain('♫ Музыка этой игры');

    await expectNoHorizontalOverflow(page);

    const path = testInfo.outputPath('live-game-setup-hierarchy.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('live-game-setup-hierarchy.png', { path, contentType: 'image/png' });

    await recording.locator('summary').click();
    await expect(recording).toHaveAttribute('open', '');
    await expect(recording.getByRole('button', { name: 'Включить запись речей', exact: true })).toBeVisible();
  });
});
