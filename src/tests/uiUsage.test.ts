import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { getUiUsageSummary, recordUiEvents } from '../server/services/uiUsageService.ts';
import { normalizeScreenPath, surfaceForPath } from '../lib/uiTelemetry.ts';
import { sanitizeUiActionName } from '../lib/uiUsageNames.ts';

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

  it('never keeps entity ids in action names', () => {
    expect(sanitizeUiActionName('club-player-6f1c2a9e-1111-4a2b-8c3d-1234567890ab')).toBe('club-player-:id');
    expect(sanitizeUiActionName('crm-evening-abc')).toBe('crm-evening-:id');
    expect(sanitizeUiActionName('seat-button-7')).toBe('seat-button-:id');
    expect(sanitizeUiActionName('player-nav-rating')).toBe('player-nav-rating');
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
        { kind: 'action', name: 'club-player-6f1c2a9e-1111-4a2b-8c3d-1234567890ab' },
      ],
    }, now);
    expect(stored).toBe(4);
    await recordUiEvents(db, { sessionKey: 'other-session-1', surface: 'player', role: 'player', events: [{ kind: 'screen', name: '/player/rating' }] }, now);
    expect(await recordUiEvents(db, { sessionKey: 'x', surface: 'player', role: 'player', events: [{ kind: 'screen', name: '/player' }] }, now)).toBe(0);
    expect(await recordUiEvents(db, { sessionKey: 'abc12345-session', surface: 'evil', role: 'player', events: [{ kind: 'screen', name: '/player' }] }, now)).toBe(0);

    const summary = await getUiUsageSummary(db, 30, now);
    expect(summary.sessions.player).toBe(2);
    expect(summary.screens[0]).toMatchObject({ surface: 'player', name: '/player/rating', events: 3, sessions: 2 });
    expect(summary.actions.map((row) => row.name).sort()).toEqual(['club-player-:id', 'player-nav-rating']);

    await db.run("INSERT INTO ui_usage_events (created_at, session_key, surface, role, kind, name) VALUES ('2025-01-01T00:00:00.000Z', 'old-session-1', 'crm', 'organizer', 'screen', '/admin')");
    const fresh = await getUiUsageSummary(db, 180, now);
    expect(fresh.sessions.crm).toBe(0);
    expect(await db.get("SELECT COUNT(*) AS n FROM ui_usage_events WHERE session_key = 'old-session-1'")).toEqual({ n: 0 });
  });
});
