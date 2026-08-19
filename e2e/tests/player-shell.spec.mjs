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

const rgbaAlpha = (value) => {
  const match = value.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
  return match ? Number(match[1]) : 1;
};

const attachViewport = async (page, testInfo, name) => {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
};

test.describe('Canonical player-cabinet visual shell', () => {
  /* 931px-wide production screenshot ≈ 388 CSS px at DPR 2.4.
     The Telegram webview area in that screenshot is about 713 CSS px tall. */
  test.use({ viewport: { width: 390, height: 713 }, deviceScaleFactor: 2.4 });

  test('matches the established player-cabinet language in a Telegram-sized viewport', async ({ page }, testInfo) => {
    await page.goto('/e2e/player-shell.html');
    await page.evaluate(async () => {
      document.documentElement.style.setProperty('--tg-viewport-stable-height', '713px');
      await document.fonts.ready;
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
        fontSans: root.getPropertyValue('--font-sans').trim(),
        background: root.getPropertyValue('--ds-background').trim(),
        surface: root.getPropertyValue('--ds-surface').trim(),
        inset: root.getPropertyValue('--ds-inset').trim(),
        primary: root.getPropertyValue('--ds-primary').trim(),
        top: top ? getComputedStyle(top).backgroundColor : '',
        topBorder: top ? getComputedStyle(top).borderBottomColor : '',
        bottom: bottom ? getComputedStyle(bottom).backgroundColor : '',
        bottomBorder: bottom ? getComputedStyle(bottom).borderTopColor : '',
      };
    });
    expect(contract.fontSans).toContain('Roboto');
    expect(contract.background).toBe('#090a0d');
    expect(contract.surface).toBe('rgba(255, 255, 255, 0.045)');
    expect(contract.inset).toBe('rgba(0, 0, 0, 0.2)');
    expect(contract.primary).toBe('#ffffff');
    expect(contract.top).toBe('rgba(11, 12, 16, 0.92)');
    expect(rgbaAlpha(contract.topBorder)).toBeGreaterThanOrEqual(0.068);
    expect(rgbaAlpha(contract.topBorder)).toBeLessThanOrEqual(0.071);
    expect(contract.bottom).toBe('rgba(11, 12, 16, 0.95)');
    expect(contract.bottomBorder).toBe('rgba(255, 255, 255, 0.1)');

    const pageTitle = page.getByRole('heading', { name: 'Главная', exact: true });
    const titleTypography = await pageTitle.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
      };
    });
    expect(titleTypography.fontFamily).toContain('Roboto');
    expect(titleTypography.fontSize).toBe('24px');
    expect(titleTypography.fontWeight).toBe('600');
    expect(titleTypography.letterSpacing).toBe('normal');

    const quickButtons = page.locator('[data-testid^="player-quick-"]');
    expect(await quickButtons.count()).toBe(2);
    const quickHeights = await quickButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
    expect(quickHeights).toEqual([40, 40]);

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
    expect(cardTreatment.background).toMatch(/^rgba\(255, 255, 255,/);
    expect(rgbaAlpha(cardTreatment.background)).toBeGreaterThanOrEqual(0.042);
    expect(rgbaAlpha(cardTreatment.background)).toBeLessThanOrEqual(0.046);
    expect(cardTreatment.border).toBe('rgba(255, 255, 255, 0.1)');

    const secondary = page
      .getByTestId('canonical-summary-card')
      .getByRole('button', { name: 'Рейтинг', exact: true });
    const secondaryTreatment = await secondary.evaluate((element) => {
      const style = getComputedStyle(element);
      return { radius: style.borderRadius, height: element.getBoundingClientRect().height };
    });
    expect(secondaryTreatment.radius).toBe('12px');
    expect(secondaryTreatment.height).toBe(44);

    const navButtons = bottomNav.locator('button');
    expect(await navButtons.count()).toBe(5);
    const navHeights = await navButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().height),
    );
    expect(navHeights).toEqual([52, 52, 52, 52, 52]);

    const home = page.getByTestId('player-nav-home');
    await expect(home).toHaveAttribute('aria-current', 'page');
    expect(await home.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(255, 255, 255, 0.09)');
    await attachViewport(page, testInfo, 'player-cabinet-canonical-home.png');

    await page.getByTestId('player-nav-games').click();
    await expect(page.getByTestId('player-nav-games')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Игры', exact: true })).toBeVisible();

    const segmented = page.locator('[data-slot="segmented-control"]').first();
    const activeSegment = segmented.locator('[aria-current="page"]');
    await expect(activeSegment).toContainText('История');
    expect(await activeSegment.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
    expect(await activeSegment.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(9, 10, 13)');

    const segmentLabelsClipped = await segmented.locator('button > span').evaluateAll((labels) =>
      labels.map((label) => label.scrollWidth > label.clientWidth + 1),
    );
    expect(segmentLabelsClipped).toEqual([false, false, false, false]);
    await expectNoHorizontalOverflow(page, 'games shell');
    await attachViewport(page, testInfo, 'player-cabinet-canonical-games.png');

    await page.getByTestId('player-nav-club').click();
    await expect(page.getByTestId('player-nav-club')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('player-shell-content')).toContainText('Текущий раздел: club');

    await page.getByTestId('player-quick-wallet').click();
    await expect(page.getByTestId('player-quick-wallet')).toHaveAttribute('aria-pressed', 'true');
    await expect(bottomNav.locator('[aria-current="page"]')).toHaveCount(0);

    await page.getByTestId('player-quick-profile').click();
    await expect(page.getByTestId('player-quick-profile')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('player-shell-content')).toContainText('Текущий раздел: profile');
  });
});