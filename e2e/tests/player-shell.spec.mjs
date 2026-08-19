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

const expectInsideViewport = async (page, locator, label) => {
  await expect(locator, `${label}: visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label}: bounding box`).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport, `${label}: viewport`).not.toBeNull();
  expect.soft(box.x, `${label}: left`).toBeGreaterThanOrEqual(-1);
  expect.soft(box.x + box.width, `${label}: right`).toBeLessThanOrEqual(viewport.width + 1);
  expect.soft(box.y, `${label}: top`).toBeGreaterThanOrEqual(-1);
  expect.soft(box.y + box.height, `${label}: bottom`).toBeLessThanOrEqual(viewport.height + 1);
};

test.describe('Canonical player-cabinet visual shell', () => {
  test.use({ viewport: { width: 390, height: 620 } });

  test('matches the established player-cabinet language in a Telegram-sized viewport', async ({ page }, testInfo) => {
    await page.goto('/e2e/player-shell.html');
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--tg-viewport-stable-height', '620px');
    });

    const topBar = page.getByTestId('player-top-bar');
    const bottomNav = page.getByTestId('player-bottom-nav');
    await expectInsideViewport(page, topBar, 'top bar');
    await expectInsideViewport(page, bottomNav, 'bottom navigation');
    await expectNoHorizontalOverflow(page, 'shared shell');

    const contract = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const top = document.querySelector('[data-testid="player-top-bar"]');
      const bottom = document.querySelector('[data-testid="player-bottom-nav"]');
      return {
        background: root.getPropertyValue('--ds-background').trim(),
        surface: root.getPropertyValue('--ds-surface').trim(),
        inset: root.getPropertyValue('--ds-inset').trim(),
        primary: root.getPropertyValue('--ds-primary').trim(),
        top: top ? getComputedStyle(top).backgroundColor : '',
        bottom: bottom ? getComputedStyle(bottom).backgroundColor : '',
      };
    });
    expect(contract.background).toBe('#090a0d');
    expect(contract.surface).toBe('rgba(255, 255, 255, 0.045)');
    expect(contract.inset).toBe('rgba(0, 0, 0, 0.2)');
    expect(contract.primary).toBe('#ffffff');
    expect(contract.top).toBe('rgba(11, 12, 16, 0.92)');
    expect(contract.bottom).toBe('rgba(11, 12, 16, 0.95)');

    const pageTitle = page.getByRole('heading', { name: 'Главная', exact: true });
    const titleTypography = await pageTitle.evaluate((element) => {
      const style = getComputedStyle(element);
      return { fontSize: style.fontSize, fontWeight: style.fontWeight, letterSpacing: style.letterSpacing };
    });
    expect(titleTypography.fontSize).toBe('24px');
    expect(titleTypography.fontWeight).toBe('600');
    expect(titleTypography.letterSpacing).toBe('normal');

    const quickButtons = page.locator('[data-testid^="player-quick-"]');
    expect(await quickButtons.count()).toBe(2);
    const quickHeights = await quickButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
    for (const height of quickHeights) expect(height).toBeGreaterThanOrEqual(44);

    const card = page.getByTestId('canonical-card');
    const cardTreatment = await card.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        radius: style.borderRadius,
        background: style.backgroundColor,
        border: style.borderTopColor,
      };
    });
    expect(cardTreatment.radius).toBe('28px');
    expect(cardTreatment.background).toBe('rgba(255, 255, 255, 0.045)');
    expect(cardTreatment.border).toBe('rgba(255, 255, 255, 0.1)');

    const segmented = page.locator('[data-slot="segmented-control"]');
    const activeSegment = segmented.locator('[aria-current="page"]');
    await expect(activeSegment).toContainText('История');
    expect(await activeSegment.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await activeSegment.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(9, 10, 13)');

    const primary = page.getByTestId('canonical-primary');
    expect(await primary.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await primary.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(9, 10, 13)');

    const navButtons = bottomNav.locator('button');
    expect(await navButtons.count()).toBe(5);
    const navHeights = await navButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
    for (const height of navHeights) expect(height).toBeGreaterThanOrEqual(44);

    const home = page.getByTestId('player-nav-home');
    await expect(home).toHaveAttribute('aria-current', 'page');
    expect(await home.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(255, 255, 255, 0.09)');

    await page.getByTestId('player-nav-club').click();
    await expect(page.getByTestId('player-nav-club')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('player-shell-content')).toContainText('Текущий раздел: club');

    await page.getByTestId('player-quick-wallet').click();
    await expect(page.getByTestId('player-quick-wallet')).toHaveAttribute('aria-pressed', 'true');
    await expect(bottomNav.locator('[aria-current="page"]')).toHaveCount(0);

    await page.getByTestId('player-quick-profile').click();
    await expect(page.getByTestId('player-quick-profile')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('player-shell-content')).toContainText('Текущий раздел: profile');

    const path = testInfo.outputPath('player-cabinet-canonical-shell.png');
    await page.screenshot({ path, fullPage: false });
    await testInfo.attach('player-cabinet-canonical-shell.png', { path, contentType: 'image/png' });
  });
});
