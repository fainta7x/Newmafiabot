import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Owner, 2026-11-15: games not played yet are not «ошибки» of a running tournament; the game judge is shown once with «Сменить».
const organization = readFileSync('src/components/crm/tournaments/TournamentOrganizationTab.tsx', 'utf8');
const setup = readFileSync('src/components/crm/tournaments/TournamentGameSetup.tsx', 'utf8');
const detail = readFileSync('src/components/crm/tournaments/TournamentDetailView.tsx', 'utf8');

describe('tournament card is simpler', () => {
  it('lists only problems of games already played', () => {
    expect(organization).toContain('blockingErrors.map');
    expect(organization).not.toContain('{readiness.errors.map');
  });
  it('shows the game judge once', () => {
    expect(setup).not.toContain('Судья игры:');
    expect(detail).not.toContain('стабильная привязка');
    expect(detail).toContain('Сменить судью игры');
  });
});
