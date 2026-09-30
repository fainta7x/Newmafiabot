import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAINTENANCE_TEXT, MAINTENANCE_TITLE, isRestartingStatus, maintenanceContacts } from '../lib/maintenance.ts';

const sw = readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8');
const app = readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');

describe('«Приложение перезапускается» instead of a bare 503', () => {
  it('the service worker says the same words and gives the same contacts as the app', () => {
    expect(sw).toContain(MAINTENANCE_TITLE);
    expect(sw).toContain(MAINTENANCE_TEXT);
    for (const contact of maintenanceContacts()) expect(sw).toContain(contact.url);
  });

  it('nginx serves the same note when the web process restarts', () => {
    const html = readFileSync(path.resolve(process.cwd(), 'public/maintenance.html'), 'utf8');
    const nginx = readFileSync(path.resolve(process.cwd(), 'deploy/nginx.conf'), 'utf8');
    expect(html).toContain(MAINTENANCE_TITLE);
    expect(html).toContain(MAINTENANCE_TEXT);
    for (const contact of maintenanceContacts()) expect(html).toContain(contact.url);
    expect(nginx).toContain('error_page 502 503 504 =503 @restarting');
    expect(nginx).toContain('try_files /maintenance.html');
  });

  it('treats a gateway answer as a restart and never touches the API', () => {
    expect([502, 503, 504].every(isRestartingStatus)).toBe(true);
    expect([401, 404, 500].some(isRestartingStatus)).toBe(false);
    expect(sw).toContain("request.mode === 'navigate'");
    // Sign-in callbacks and the API always go straight to the server.
    expect(sw).toContain("url.pathname.startsWith('/api')");
    expect(app).toContain("status: 'restarting'");
  });
});
