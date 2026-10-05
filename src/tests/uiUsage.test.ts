import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { getUiUsageSummary, loadPlayerActivity, recordUiEvents } from '../server/services/uiUsageService.ts';
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

  it('keeps one player\'s history apart: visits by 30-minute gaps, screens, clicks, last seen', async () => {
    const db = makeDb();
    const now = new Date('2026-10-05T12:00:00Z');
    const at = (iso: string) => iso;
    await recordUiEvents(db, { sessionKey: 'tab-aaaa-1111', surface: 'player', role: 'player', playerId: 'p1', events: [
      { kind: 'screen', name: '/player', at: at('2026-10-05T08:00:00Z') },
      { kind: 'action', name: 'player-nav-rating', at: at('2026-10-05T08:01:00Z') },
      { kind: 'screen', name: '/player/rating', at: at('2026-10-05T08:01:00Z') },
      // a gap of more than 30 minutes starts a second visit
      { kind: 'screen', name: '/player/rating', at: at('2026-10-05T11:00:00Z') },
      { kind: 'action', name: 'profile-tab-games', at: at('2026-10-05T11:02:00Z') },
    ] }, now);
    await recordUiEvents(db, { sessionKey: 'tab-bbbb-2222', surface: 'player', role: 'player', playerId: 'p2', events: [{ kind: 'screen', name: '/player/club', at: at('2026-10-05T09:00:00Z') }] }, now);
    // an organizer's events never carry a player id
    await recordUiEvents(db, { sessionKey: 'tab-cccc-3333', surface: 'crm', role: 'organizer', playerId: 'p1', events: [{ kind: 'screen', name: '/admin', at: at('2026-10-05T09:30:00Z') }] }, now);

    const activity = await loadPlayerActivity(db, 'p1', 30, now);
    expect(activity.visits).toMatchObject({ total: 2, last_7_days: 2, today: 2 });
    expect(activity.active_days).toBe(1);
    expect(activity.top_screens[0]).toEqual({ name: '/player/rating', opens: 2 });
    expect(activity.top_screens.map((row) => row.name)).not.toContain('/player/club');
    expect(activity.top_screens.map((row) => row.name)).not.toContain('/admin');
    expect(activity.top_actions.map((row) => row.name).sort()).toEqual(['player-nav-rating', 'profile-tab-games']);
    expect(activity.last_seen_at).toBe('2026-10-05T11:02:00.000Z');
    expect(activity.recent[0]).toMatchObject({ kind: 'action', name: 'profile-tab-games' });

    const nobody = await loadPlayerActivity(db, 'unknown', 30, now);
    expect(nobody).toMatchObject({ visits: { total: 0 }, last_seen_at: null, top_screens: [] });
    // the anonymous summary still has no player in it
    const summary = await getUiUsageSummary(db, 30, now);
    expect(JSON.stringify(summary)).not.toContain('p1');
  });
});
