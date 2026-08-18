import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('organizer session boundary', () => {
  it('keeps auth and shared CRM snapshot loading outside OrganizerCRM', () => {
    const crm = read('src/components/OrganizerCRM.tsx');
    const session = read('src/components/crm/useOrganizerCrmSession.ts');

    expect(crm).toContain("import { useOrganizerCrmSession } from './crm/useOrganizerCrmSession.ts'");
    expect(crm).not.toContain('api.getMe()');
    expect(crm).not.toContain('api.getCrmOverview()');
    expect(crm).not.toContain('api.login(');
    expect(crm).not.toContain('api.logout()');

    expect(session).toContain('api.getMe()');
    expect(session).toContain('api.getCrmOverview()');
    expect(session).toContain('api.getEvenings()');
    expect(session).toContain('api.getPlayers()');
    expect(session).toContain('api.login(password)');
    expect(session).toContain('api.logout()');
    expect(session).toContain("document.addEventListener('visibilitychange', scheduleRefresh)");
    expect(session).toContain("window.addEventListener('focus', scheduleRefresh)");
  });
});
