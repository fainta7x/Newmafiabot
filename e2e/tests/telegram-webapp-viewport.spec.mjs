import { test, expect } from '@playwright/test';

const cases = [
  { width: 360, height: 640, tgHeight: 596, compactHeight: 548 },
  { width: 390, height: 713, tgHeight: 669, compactHeight: 612 },
];

async function installTelegramMock(page, values) {
  await page.addInitScript(({ tgHeight }) => {
    const handlers = new Map();
    const webApp = {
      viewportHeight: tgHeight,
      viewportStableHeight: tgHeight,
      safeAreaInset: { top: 24, bottom: 16, left: 0, right: 0 },
      contentSafeAreaInset: { top: 28, bottom: 18, left: 0, right: 0 },
      ready() { window.__tgReadyCalls = (window.__tgReadyCalls || 0) + 1; },
      expand() { window.__tgExpandCalls = (window.__tgExpandCalls || 0) + 1; },
      disableVerticalSwipes() { window.__tgDisableSwipeCalls = (window.__tgDisableSwipeCalls || 0) + 1; },
      onEvent(event, callback) {
        const bucket = handlers.get(event) || [];
        bucket.push(callback);
        handlers.set(event, bucket);
      },
      offEvent(event, callback) {
        handlers.set(event, (handlers.get(event) || []).filter((item) => item !== callback));
      },
    };
    window.__tgHandlers = handlers;
    window.Telegram = { WebApp: webApp };
  }, values);
}

async function assertTelegramGeometry(page, expectedHeight, expectedBottom = 18) {
  const geometry = await page.evaluate(() => ({
    viewportHeight: getComputedStyle(document.documentElement).getPropertyValue('--tg-viewport-height').trim(),
    contentTop: getComputedStyle(document.documentElement).getPropertyValue('--tg-content-safe-area-top').trim(),
    contentBottom: getComputedStyle(document.documentElement).getPropertyValue('--tg-content-safe-area-bottom').trim(),
    overflow: document.documentElement.scrollWidth > innerWidth,
    readyCalls: window.__tgReadyCalls || 0,
  }));
  expect(geometry.viewportHeight).toBe(`${expectedHeight}px`);
  expect(geometry.contentTop).toBe('28px');
  expect(geometry.contentBottom).toBe(`${expectedBottom}px`);
  expect(geometry.overflow).toBe(false);
  expect(geometry.readyCalls).toBeGreaterThan(0);
}

async function compactTelegramViewport(page, height) {
  await page.evaluate(({ height }) => {
    const webApp = window.Telegram.WebApp;
    webApp.viewportHeight = height;
    webApp.contentSafeAreaInset = { ...webApp.contentSafeAreaInset, bottom: 24 };
    for (const callback of window.__tgHandlers.get('viewportChanged') || []) callback();
    for (const callback of window.__tgHandlers.get('contentSafeAreaChanged') || []) callback();
  }, { height });
}

for (const item of cases) {
  for (const surface of [
    { route: '/e2e/player-cabinet.html?scenario=live', name: 'player' },
    { route: '/e2e/crm-overview.html', name: 'crm' },
  ]) {
    test(`Telegram WebApp ${surface.name} geometry ${item.width}px`, async ({ page }, info) => {
      await page.setViewportSize({ width: item.width, height: item.height });
      await installTelegramMock(page, item);
      await page.goto(surface.route);
      await page.locator('body').waitFor({ state: 'visible' });
      await assertTelegramGeometry(page, item.tgHeight);
      await page.screenshot({ path: info.outputPath(`telegram-${surface.name}-${item.width}-initial.png`), fullPage: true });

      await compactTelegramViewport(page, item.compactHeight);
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tg-viewport-height').trim())).toBe(`${item.compactHeight}px`);
      await assertTelegramGeometry(page, item.compactHeight, 24);
      await page.screenshot({ path: info.outputPath(`telegram-${surface.name}-${item.width}-compact.png`), fullPage: true });
    });
  }
}
