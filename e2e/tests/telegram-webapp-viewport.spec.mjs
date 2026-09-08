import { test, expect } from '@playwright/test';

const cases = [
  {
    name: 'android-narrow', width: 360, height: 640, tgHeight: 596, compactHeight: 548,
    safe: { top: 24, bottom: 16, left: 0, right: 0 }, content: { top: 28, bottom: 18, left: 0, right: 0 },
  },
  {
    name: 'ios-portrait', width: 390, height: 713, tgHeight: 669, compactHeight: 612,
    safe: { top: 47, bottom: 28, left: 0, right: 0 }, content: { top: 51, bottom: 34, left: 0, right: 0 },
  },
  {
    name: 'telegram-landscape', width: 713, height: 390, tgHeight: 352, compactHeight: 320,
    safe: { top: 0, bottom: 12, left: 36, right: 36 }, content: { top: 8, bottom: 16, left: 44, right: 44 },
  },
];

async function installTelegramMock(page, values) {
  await page.addInitScript(({ tgHeight, safe, content }) => {
    const handlers = new Map();
    const webApp = {
      viewportHeight: tgHeight,
      viewportStableHeight: tgHeight,
      safeAreaInset: safe,
      contentSafeAreaInset: content,
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

async function assertTelegramGeometry(page, values, expectedHeight = values.tgHeight, expectedBottom = values.content.bottom) {
  const geometry = await page.evaluate(() => ({
    viewportHeight: getComputedStyle(document.documentElement).getPropertyValue('--tg-viewport-height').trim(),
    contentTop: getComputedStyle(document.documentElement).getPropertyValue('--tg-content-safe-area-top').trim(),
    contentBottom: getComputedStyle(document.documentElement).getPropertyValue('--tg-content-safe-area-bottom').trim(),
    contentLeft: getComputedStyle(document.documentElement).getPropertyValue('--tg-content-safe-area-left').trim(),
    contentRight: getComputedStyle(document.documentElement).getPropertyValue('--tg-content-safe-area-right').trim(),
    overflow: document.documentElement.scrollWidth > innerWidth,
    bodyOverflow: document.body.scrollWidth > innerWidth,
    readyCalls: window.__tgReadyCalls || 0,
  }));
  expect(geometry.viewportHeight).toBe(`${expectedHeight}px`);
  expect(geometry.contentTop).toBe(`${values.content.top}px`);
  expect(geometry.contentBottom).toBe(`${expectedBottom}px`);
  expect(geometry.contentLeft).toBe(`${values.content.left}px`);
  expect(geometry.contentRight).toBe(`${values.content.right}px`);
  expect(geometry.overflow).toBe(false);
  expect(geometry.bodyOverflow).toBe(false);
  expect(geometry.readyCalls).toBeGreaterThan(0);
}

async function compactTelegramViewport(page, values) {
  await page.evaluate(({ height, bottom }) => {
    const webApp = window.Telegram.WebApp;
    webApp.viewportHeight = height;
    webApp.contentSafeAreaInset = { ...webApp.contentSafeAreaInset, bottom };
    for (const callback of window.__tgHandlers.get('viewportChanged') || []) callback();
    for (const callback of window.__tgHandlers.get('contentSafeAreaChanged') || []) callback();
  }, { height: values.compactHeight, bottom: values.content.bottom + 6 });
}

async function assertFixedNavInsideHorizontalSafeArea(page, selector, values) {
  const rect = await page.locator(selector).boundingBox();
  expect(rect).not.toBeNull();
  expect(rect.x).toBeGreaterThanOrEqual(values.content.left - 1);
  expect(rect.x + rect.width).toBeLessThanOrEqual(values.width - values.content.right + 1);
}

for (const item of cases) {
  for (const surface of [
    { route: '/e2e/player-cabinet.html?scenario=live', name: 'player', nav: '[data-testid="player-bottom-nav"]' },
    { route: '/e2e/organizer-crm.html', name: 'crm', nav: '.organizer-bottom-nav' },
    { route: '/e2e/player-profile.html', name: 'profile' },
    { route: '/e2e/live-game.html', name: 'live-game' },
  ]) {
    test(`Telegram ${item.name} ${surface.name} geometry`, async ({ page }, info) => {
      await page.setViewportSize({ width: item.width, height: item.height });
      await installTelegramMock(page, item);
      await page.goto(surface.route);
      await page.locator('body').waitFor({ state: 'visible' });
      await assertTelegramGeometry(page, item);
      if (surface.nav) await assertFixedNavInsideHorizontalSafeArea(page, surface.nav, item);
      if (surface.name === 'crm') {
        await expect(page.locator('.crm-premium h1')).toHaveCount(1);
      }
      await page.screenshot({ path: info.outputPath(`telegram-${item.name}-${surface.name}-initial.png`), fullPage: true });

      await compactTelegramViewport(page, item);
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tg-viewport-height').trim())).toBe(`${item.compactHeight}px`);
      await assertTelegramGeometry(page, item, item.compactHeight, item.content.bottom + 6);
      await page.screenshot({ path: info.outputPath(`telegram-${item.name}-${surface.name}-compact.png`), fullPage: true });
    });
  }
}

test('fixed Player and Organizer navigation respect horizontal Telegram content-safe insets', async ({ page }) => {
  const item = cases[2];
  await page.setViewportSize({ width: item.width, height: item.height });
  await installTelegramMock(page, item);
  await page.goto('/e2e/player-cabinet.html?scenario=live');
  await assertFixedNavInsideHorizontalSafeArea(page, '[data-testid="player-bottom-nav"]', item);
  await page.goto('/e2e/organizer-crm.html');
  await expect(page.locator('.organizer-bottom-nav')).toBeVisible();
  await assertFixedNavInsideHorizontalSafeArea(page, '.organizer-bottom-nav', item);
});

test('canonical profile tabs, filters, Elo and owner actions stay usable in Telegram', async ({ page }, info) => {
  const item = cases[1];
  await page.setViewportSize({ width: item.width, height: item.height });
  await installTelegramMock(page, item);
  await page.goto('/e2e/player-profile.html');
  await expect(page.getByTestId('canonical-premium-profile')).toBeVisible();

  await page.getByRole('button', { name: 'Игры' }).click();
  await page.getByText('Дополнительные фильтры').click();
  await page.getByLabel('Роль').selectOption('sheriff');
  await page.getByLabel('Команда').selectOption('black');
  await page.getByLabel('Результат').selectOption('win');
  await assertTelegramGeometry(page, item);
  await page.screenshot({ path: info.outputPath('telegram-profile-games-filters.png'), fullPage: true });

  await page.getByRole('button', { name: 'Elo' }).click();
  await expect(page.getByText('1542').last()).toBeVisible();
  await expect(page.getByText('+15')).toBeVisible();
  await page.screenshot({ path: info.outputPath('telegram-profile-elo.png'), fullPage: true });

  await page.getByRole('button', { name: 'Награды' }).click();
  await expect(page.getByTestId('award-suggestion-action')).toBeVisible();
  await page.getByRole('button', { name: 'Связи' }).click();
  await expect(page.getByTestId('smart-friend-invite-suggestions')).toBeVisible();
  await page.screenshot({ path: info.outputPath('telegram-profile-owner-connections.png'), fullPage: true });
});

test('invitation picker labels every server evening state before sending', async ({ page }, info) => {
  const item = cases[0];
  await page.setViewportSize({ width: item.width, height: item.height });
  await installTelegramMock(page, item);
  await page.goto('/e2e/player-profile.html?target=friend');
  await page.getByRole('button', { name: 'Связи' }).click();
  const picker = page.getByTestId('invitation-picker');
  await expect(picker).toBeVisible();
  for (const label of ['Можно пригласить','Уже записан','Уже в резерве','Уже приглашён','Регистрация закрыта','Лимит приглашений исчерпан','Формат недоступен']) {
    await expect(picker.getByRole('option', { name: new RegExp(label) })).toHaveCount(1);
  }
  await picker.getByLabel('Игровой вечер для приглашения').selectOption('evening-registered');
  await expect(picker.getByRole('button', { name: 'Уже записан' })).toBeDisabled();
  await assertTelegramGeometry(page, item);
  await page.screenshot({ path: info.outputPath('telegram-profile-invitation-states.png'), fullPage: true });
});

test('unavailable invitation recipient is labelled before any send action', async ({ page }) => {
  const item = cases[0];
  await page.setViewportSize({ width: item.width, height: item.height });
  await installTelegramMock(page, item);
  await page.goto('/e2e/player-profile.html?target=unavailable');
  await page.getByRole('button', { name: 'Связи' }).click();
  const unavailable = page.getByTestId('invitation-unavailable-state');
  await expect(unavailable).toBeVisible();
  await expect(unavailable.getByText('Игрок недоступен для приглашения')).toBeVisible();
  await expect(unavailable.getByRole('button')).toHaveCount(0);
});

test('real Organizer CRM and Live Game modal content remains inside Telegram safe area', async ({ page }, info) => {
  const item = cases[1];
  await page.setViewportSize({ width: item.width, height: item.height });
  await installTelegramMock(page, item);

  await page.goto('/e2e/crm-login.html');
  await expect(page.getByText('Вход для организатора')).toBeVisible();
  await assertTelegramGeometry(page, item);
  await page.screenshot({ path: info.outputPath('telegram-crm-real-login-modal.png'), fullPage: true });

  await page.goto('/e2e/live-game-overlay.html');
  const confirmation = page.getByTestId('live-discipline-confirmation');
  await expect(confirmation).toBeVisible();
  const rect = await confirmation.boundingBox();
  expect(rect.y).toBeGreaterThanOrEqual(item.content.top - 1);
  expect(rect.y + rect.height).toBeLessThanOrEqual(item.tgHeight - item.content.bottom + 1);
  await assertTelegramGeometry(page, item);
  await page.screenshot({ path: info.outputPath('telegram-live-game-real-modal.png'), fullPage: true });
});

test('browser fallback keeps representative surfaces free of horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 713 });
  for (const route of ['/e2e/player-cabinet.html?scenario=live','/e2e/organizer-crm.html','/e2e/player-profile.html','/e2e/live-game.html','/e2e/live-game-overlay.html']) {
    await page.goto(route);
    await page.locator('body').waitFor({ state: 'visible' });
    const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth, tg: Boolean(window.Telegram?.WebApp) }));
    expect(state.tg).toBe(false);
    expect(state.overflow).toBe(false);
  }
});
