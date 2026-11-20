import { test, expect } from '@playwright/test';
import { auditScreen } from './support/layoutAudit.mjs';

test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const state = 'a'.repeat(40);

async function setup(page, { storageBlocked = false, popup = 'open', telegram = false, handoff = 'pending' } = {}) {
  await page.addInitScript(({ storageBlocked, popup }) => {
    // The ordinary Telegram browser has no Mini App bridge. Exercise that path separately from a real Mini App.
    window.open = () => {
      if (popup === 'throw') throw new DOMException('Denied', 'SecurityError');
      if (popup === 'blocked') return null;
      return { closed: popup === 'closed', location: { href: '' }, close() {} };
    };
    if (storageBlocked) Object.defineProperty(window, 'localStorage', {
      configurable: true, get() { throw new DOMException('Access denied', 'SecurityError'); },
    });
  }, { storageBlocked, popup });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { linked: false, isOrganizer: false } });
    if (path === '/api/test-environment/status') return route.fulfill({ json: { enabled: false } });
    if (path === '/api/player/me') return route.fulfill({ status: 401, json: { error: 'not signed in' } });
    if (path === '/api/auth/onboarding') return route.fulfill({ status: 404, json: { active: false } });
    if (path === '/api/integrations/player/vk/start') return route.fulfill({ json: { authorize_url: `https://id.vk.test/authorize?state=${state}` } });
    if (path === '/api/integrations/player/vk/handoff') return route.fulfill({ json: { status: handoff, return_to: '/player?vk_test=done' } });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto('/player');
  await expect(page.getByRole('button', { name: 'Продолжить через VK' })).toBeVisible();
  // Install the native bridge double after the self-hosted SDK has initialized its WebApp object.
  if (telegram) await page.evaluate(() => {
    window.Telegram.WebApp = { ...window.Telegram.WebApp, platform: 'ios', openLink(url) { window.__vkOpened = url; } };
  });
}

test('VK start retains handoff polling when Safari storage is unavailable', async ({ page }) => {
  await setup(page, { storageBlocked: true });
  const polls = [];
  page.on('request', (request) => { if (request.url().endsWith('/vk/handoff')) polls.push(request.postDataJSON()); });
  await page.getByRole('button', { name: 'Продолжить через VK' }).tap();
  await expect(page.getByTestId('vk-player-access-waiting')).toBeVisible();
  await expect.poll(() => polls.length).toBeGreaterThan(0);
  expect(polls[0]).toEqual({ state });
  await page.getByRole('button', { name: 'Отменить', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Продолжить через VK' })).toBeEnabled();
});

test('normal storage resumes the handoff after reload and can be cancelled', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Продолжить через VK' }).tap();
  await expect(page.getByTestId('vk-player-access-waiting')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('vk-player-access-waiting')).toBeVisible();
  await page.getByRole('button', { name: 'Отменить', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Продолжить через VK' })).toBeEnabled();
});

test('a completed handoff navigates even without Safari storage', async ({ page }) => {
  await setup(page, { storageBlocked: true, handoff: 'done' });
  await page.getByRole('button', { name: 'Продолжить через VK' }).tap();
  await expect(page).toHaveURL(/\/player\?vk_test=done$/);
});

for (const popup of ['blocked', 'closed', 'throw']) {
  test(`VK falls back to the same tab when the popup is ${popup}`, async ({ page }) => {
    await setup(page, { popup });
    await page.route('https://id.vk.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>Mock VK</p>' }));
    await page.getByRole('button', { name: 'Продолжить через VK' }).tap();
    await expect(page).toHaveURL(`https://id.vk.test/authorize?state=${state}`);
  });
}

test('Telegram Mini App opens VK through the bridge with storage denied', async ({ page }) => {
  await setup(page, { storageBlocked: true, telegram: true });
  await page.getByRole('button', { name: 'Продолжить через VK' }).tap();
  await expect(page.getByTestId('vk-player-access-waiting')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__vkOpened)).toBe(`https://id.vk.test/authorize?state=${state}`);
});

for (const [width, height] of [[360, 640], [390, 844], [1366, 768], [1440, 900], [1920, 1089]]) {
  test(`entry, waiting and timeout layout at ${width}x${height}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    await expect.poll(() => page.evaluate(auditScreen)).toEqual([]);
    await page.getByRole('button', { name: 'Продолжить через VK' }).tap();
    await expect(page.getByTestId('vk-player-access-waiting')).toBeVisible();
    await expect.poll(() => page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath('waiting.png') });
    await page.getByRole('button', { name: 'Отменить', exact: true }).tap();
    await page.clock.install();
    await page.route('**/api/integrations/player/vk/start', () => { /* No response: the client must time out. */ });
    const request = page.waitForRequest('**/api/integrations/player/vk/start');
    await page.getByRole('button', { name: 'Продолжить через VK' }).tap();
    await request;
    await page.clock.runFor(15_001);
    await expect(page.getByText('Сервер не ответил. Проверьте интернет и попробуйте ещё раз.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Продолжить через VK' })).toBeEnabled();
    await expect.poll(() => page.evaluate(auditScreen)).toEqual([]);
    await page.screenshot({ path: info.outputPath('timeout.png') });
  });
}
