import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Owner, 2026-11-19: on iPhones over mobile internet telegram.org did not load, the app stayed blank or showed the login
// screen. The Telegram Mini Apps script is served from our own server.
describe('Telegram script from our server', () => {
  it('index.html loads /telegram-web-app.js, never telegram.org', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('<script defer src="/telegram-web-app.js"></script>');
    expect(html).not.toContain('telegram.org/js');
    expect(existsSync('public/telegram-web-app.js')).toBe(true);
    expect(readFileSync('public/telegram-web-app.js', 'utf8')).toContain('window.Telegram.WebApp');
  });
});

// Owner, 2026-11-20: an iPhone user still saw nothing load. The Google Fonts stylesheet in <head> blocked the app from
// starting while fonts.googleapis.com was slow or unreachable; fonts must load without blocking the first screen.
describe('Fonts never block the first screen', () => {
  it('the Google Fonts stylesheet is non-blocking', () => {
    const html = readFileSync('index.html', 'utf8');
    const tag = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]*rel="stylesheet"[^>]*>/)?.[0] || '';
    expect(tag).toContain('media="print"');
    expect(tag).toContain("onload=\"this.media='all'\"");
  });
});
