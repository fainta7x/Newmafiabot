import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { getUiUsageSummary, recordUiEvents } from '../server/services/uiUsageService.ts';
import { normalizeScreenPath, surfaceForPath } from '../lib/uiTelemetry.ts';

const makeDb = () => {
  const sqlite = new Database(':memory:');
  return {
    run: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).run(...params),
    all: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).all(...params),
    get: async (sql: string, params: unknown[] = []) => sqlite.prepare(sql).get(...params),
  } as any;
};

describe('UI usage tracking', () => {
  it('normalizes screen paths without ids', () => {
    expect(normalizeScreenPath('/admin/evenings/385404e7-ac7e-4b5d-adb3-f289f4a2482c/games?x=1')).toBe('/admin/evenings/:id/games');
    expect(normalizeScreenPath('/player/rating/tournaments')).toBe('/player/rating/tournaments');
    expect(surfaceForPath('/admin/players')).toBe('crm');
    expect(surfaceForPath('/player')).toBe('player');
  });

  it('stores only well-formed anonymous events and summarizes them by session', async () => {
    const db = makeDb();
    const now = new Date('2026-09-23T20:00:00Z');
    const stored = await recordUiEvents(db, {
      sessionKey: 'abc12345-session',
      surface: 'player',
      role: 'player',
      events: [
        { kind: 'screen', name: '/player/rating' },
        { kind: 'screen', name: '/player/rating' },
        { kind: 'action', name: 'player-nav-rating' },
        { kind: 'action', name: 'Тест Иван' },
        { kind: 'hack', name: '/player' },
      ],
    }, now);
    expect(stored).toBe(3);
    await recordUiEvents(db, { sessionKey: 'other-session-1', surface: 'player', role: 'player', events: [{ kind: 'screen', name: '/player/rating' }] }, now);
    expect(await recordUiEvents(db, { sessionKey: 'x', surface: 'player', role: 'player', events: [{ kind: 'screen', name: '/player' }] }, now)).toBe(0);
    expect(await recordUiEvents(db, { sessionKey: 'abc12345-session', surface: 'evil', role: 'player', events: [{ kind: 'screen', name: '/player' }] }, now)).toBe(0);

    const summary = await getUiUsageSummary(db, 30, now);
    expect(summary.sessions.player).toBe(2);
    expect(summary.screens[0]).toMatchObject({ surface: 'player', name: '/player/rating', events: 3, sessions: 2 });
    expect(summary.actions).toEqual([{ surface: 'player', name: 'player-nav-rating', events: 1, sessions: 1 }]);
  });
});
