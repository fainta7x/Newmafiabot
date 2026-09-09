import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('VK-ACCESS-004 organizer routing and UI', () => {
  it('keeps onboarding link resolution organizer-only and exposes safe overview diagnostics', () => {
    const routes = read('src/server/routes/crmRoutes.ts');
    expect(routes).toContain("router.post('/onboarding-links/:id/resolve', requireOrganizerAuth");
    expect(routes).toContain('pendingOnboardingLinks');
    expect(routes).toContain('listPendingPlayerOnboardingLinks');
    expect(routes).toContain('resolvePendingPlayerOnboardingLink');
  });

  it('shows mobile-friendly approve/reject actions without raw external identity data', () => {
    const ui = read('src/components/crm/OrganizerCommandCenter.tsx');
    expect(ui).toContain('data-testid="pending-onboarding-links"');
    expect(ui).toContain('Подтвердить');
    expect(ui).toContain('Отклонить');
    expect(ui).toContain('grid grid-cols-2');
    expect(ui).toContain('min-h-11');
    expect(ui).not.toContain('external_user_id');
  });

  it('documents the channel-neutral verified onboarding contract and runtime separation', () => {
    const docs = read('docs/player-onboarding.md');
    expect(docs).toContain('Nickname is profile data, not identity proof');
    expect(docs).toContain('HttpOnly cookie');
    expect(docs).toContain('Public VK evening registration remains a separate');
    expect(docs).toContain('runtime verification is separate from green CI');
  });
});
