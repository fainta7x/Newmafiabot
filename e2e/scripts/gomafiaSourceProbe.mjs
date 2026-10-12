/**
 * One-time public-source inspection for PR #852.
 * Uses a clean, unauthenticated browser. Does not log cookies, tokens, response bodies
 * or registration/account details. Read-only tabs and filters only.
 */
import { chromium } from '@playwright/test';

const target = 'https://gomafia.pro/stats/1202';
const log = (kind, value) => console.log('GOMAFIA_PROBE', kind, JSON.stringify(value));
const trim = (text, n = 160) => String(text ?? '').trim().slice(0, n);
const noCredentials = (raw) => {
  try {
    const url = new URL(raw);
    if (!['gomafia.pro', 'www.gomafia.pro'].includes(url.hostname)) return null;
    return { path: url.pathname, queryKeys: [...url.searchParams.keys()].slice(0, 12) };
  } catch { return null; }
};
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'ru-RU', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const calls = [];
  page.on('request', request => {
    const url = noCredentials(request.url());
    if (url && calls.length < 100) calls.push({ method: request.method(), ...url, resource: request.resourceType() });
  });
  page.on('response', async response => {
    const source = noCredentials(response.url());
    if (!source) return;
    const type = response.headers()['content-type'] ?? '';
    if (!/json/i.test(type)) return;
    if (response.request().resourceType() === 'document') return;
    try {
      const body = await response.json();
      const shape = (item) => {
        if (Array.isArray(item)) return { type: 'array', count: item.length, itemKeys: item[0] && typeof item[0] === 'object' ? Object.keys(item[0]).slice(0, 30) : [] };
        return item && typeof item === 'object'
          ? { type: 'object', keys: Object.keys(item).slice(0, 30),
            arrayKeys: Object.keys(item).filter(key => Array.isArray(item[key])).slice(0, 15) }
          : { type: typeof item };
      };
      log('json', { ...source, method: response.request().method(), status: response.status(), shape: shape(body) });
    } catch { /* non-JSON error body */ }
  });
  page.on('console', message => { if (message.type() === 'error') log('console-error', trim(message.text(), 250)); });
  const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 25000 });
  log('navigation', { status: response?.status(), url: noCredentials(page.url()), title: trim(await page.title()), text: trim(await page.locator('body').innerText().catch(() => ''), 1100) });
  await page.waitForTimeout(2000);
  const state = async label => {
    log(label, await page.evaluate(() => ({
      controls: [...document.querySelectorAll('button,select,[role="combobox"],[role="tab"],[role="option"],a')]
        .filter(e => !['Войти', 'Зарегистрироваться'].includes((e.textContent || '').trim()))
        .slice(0, 90).map(e => ({
          tag: e.tagName.toLowerCase(), role: e.getAttribute('role'),
          text: (e.textContent ?? '').trim().slice(0, 90),
          type: e.getAttribute('type'),
          href: e.tagName === 'A' ? new URL(e.getAttribute('href'), location.href).pathname : undefined,
        })),
      scripts: [...document.querySelectorAll('script[src]')].slice(0, 18)
        .map(e => { try { return new URL(e.src).pathname; } catch { return null; } }),
      framework: { next: !!document.querySelector('#__NEXT_DATA__'), nuxt: !!document.querySelector('#__NUXT_DATA__') },
    })));
  };
  await state('default-dom');
  for (const label of ['История игр', '2026', 'Все игры', 'Турниры ФСМ', '2025']) {
    const item = page.getByText(label, { exact: true }).first();
    if (await item.count() === 0) { log('not-found', label); continue; }
    try {
      await item.click({ timeout: 4500 });
      await page.waitForTimeout(1800);
      await state('after-' + label);
      log('visible-text-' + label, trim(await page.locator('main').innerText().catch(() => ''), 1100));
    } catch (error) { log('click-failed-' + label, trim(error, 220)); }
  }
  log('requests', calls.filter(call => call.resource === 'fetch' || call.resource === 'xhr' || call.resource === 'document').slice(0, 75));
  await context.close();
} catch (error) {
  log('probe-error', trim(error, 550));
} finally {
  await browser?.close();
}
