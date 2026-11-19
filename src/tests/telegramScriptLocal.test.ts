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
