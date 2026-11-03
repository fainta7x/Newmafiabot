// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { clearLiveGameCheckpoint, ensureLiveGameCheckpointSchema, loadLiveGameCheckpoint, normalizeCheckpoint, saveLiveGameCheckpoint } from '../server/services/liveGameCheckpointService.ts';
import { readDeviceSession, readLiveGameCheckpoint, writeLiveGameCheckpoint } from '../lib/liveGameCheckpoint.ts';
import { clubLiveEvidenceKey, clubLiveSessionKey } from '../lib/liveClubSession.ts';

// «Продолжить игру» for ANY game through the one «Игра» layer (owner, 2026-11-03).
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); localStorage.clear(); });
const now = '2026-11-03T10:00:00Z';
const session = (extra: Record<string, unknown> = {}) => JSON.stringify({ phase: 'day_speeches', roundNumber: 2, activePlayers: [{ slot_num: 1 }], ...extra });

const seed = async (clubStatus = 'draft', tournamentStatus = 'active') => {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  await db.run(`INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
    VALUES (7,NULL,1,'2026-11-03','red','',?,'[]',?)`, [JSON.stringify({ kind: 'club_evening_protocol', protocol: { status: clubStatus } }), now]);
  await db.run(`INSERT INTO tournaments (id,title,date,status,created_at,updated_at) VALUES ('t1','Турнир','2026-11-03','active',?,?)`, [now, now]);
  await db.run(`INSERT INTO tournament_games (id,tournament_id,game_number,status) VALUES ('tg1','t1',1,?)`, [tournamentStatus]);
  return db;
};

describe('server copy of a live game — any game', () => {
  it.each(['club:7', 'tournament:tg1'])('%s: keeps the latest copy and gives it back', async (key) => {
    const db = await seed();
    expect(await saveLiveGameCheckpoint(db, key, { session: session(), evidence: '{"votes":[]}' })).toBe('saved');
    expect(await saveLiveGameCheckpoint(db, key, { session: session({ roundNumber: 3 }) })).toBe('saved');
    expect(JSON.parse((await loadLiveGameCheckpoint(db, key))!.session).roundNumber).toBe(3);
    await clearLiveGameCheckpoint(db, key);
    expect(await loadLiveGameCheckpoint(db, key)).toBeNull();
  });

  it('a finished game of either kind has no copy; an unknown game is missing', async () => {
    const db = await seed('completed', 'completed');
    expect(await saveLiveGameCheckpoint(db, 'club:7', { session: session() })).toBe('finished');
    expect(await saveLiveGameCheckpoint(db, 'tournament:tg1', { session: session() })).toBe('finished');
    expect(await saveLiveGameCheckpoint(db, 'club:99', { session: session() })).toBe('missing');
    expect(await saveLiveGameCheckpoint(db, 'nonsense', { session: session() })).toBe('missing');
  });

  it('moves the copies of the first, club-only table to the game key', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    await db.exec('CREATE TABLE live_game_checkpoints (game_id INTEGER PRIMARY KEY, payload TEXT NOT NULL, saved_at TEXT NOT NULL)');
    await db.run("INSERT INTO live_game_checkpoints VALUES (7, '{\"session\":\"x\"}', ?)", [now]);
    await ensureLiveGameCheckpointSchema(db);
    expect(await db.get('SELECT game_key, payload FROM live_game_checkpoints')).toEqual({ game_key: 'club:7', payload: '{"session":"x"}' });
  });

  it('refuses a session that is not a started game', () => {
    expect(normalizeCheckpoint({ session: JSON.stringify({ phase: 'setup', activePlayers: [] }) })).toBeNull();
    expect(normalizeCheckpoint({ session: 'not json' })).toBeNull();
  });
});

describe('device side — any game', () => {
  it('a game of an evening: its own keys, the last Undo steps only', () => {
    localStorage.setItem(clubLiveSessionKey(7), session({ historyStack: Array.from({ length: 12 }, (_, i) => ({ i })) }));
    expect(JSON.parse(readLiveGameCheckpoint('club:7')!.session).historyStack.map((item: any) => item.i)).toEqual([7, 8, 9, 10, 11]);
    writeLiveGameCheckpoint('club:8', { session: session(), evidence: '{"votes":[]}' });
    expect(localStorage.getItem(clubLiveEvidenceKey(8))).toBe('{"votes":[]}');
  });

  it('a tournament game: the shared engine key counts only when it holds this game', () => {
    localStorage.setItem('mafia_live_session', session({ sessionKey: 'tournament:other' }));
    expect(readDeviceSession('tournament:tg1')).toBeNull();
    writeLiveGameCheckpoint('tournament:tg1', { session: session({ sessionKey: 'tournament:tg1' }), evidence: '{"votes":[1]}' });
    expect(readDeviceSession('tournament:tg1')?.roundNumber).toBe(2);
    expect(localStorage.getItem('mafia_live_session:tournament:tg1:protocol')).toBe('{"votes":[1]}');
  });
});
