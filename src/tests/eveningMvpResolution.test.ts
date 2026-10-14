import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from '../db/ensureOrganizerPlayerAccessSchema.ts';
import { decideEveningMvp, mvpDecisionCallbackData, resolveEveningMvp } from '../server/services/eveningMvpService.ts';
import type { CompletedGameSnapshot } from '../server/services/clubGameAnalyticsService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const PLAYERS = ['aaaa1111', 'bbbb2222', 'cccc3333', 'dddd4444'];

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,venue,created_at,updated_at)
    VALUES ('ev','Пятница','2026-03-06T17:00:00Z','Europe/Moscow','CASUAL','completed',20,100,'Суп с Котом',?,?)`, [now, now]);
  for (const id of [...PLAYERS, PRIMARY_ORGANIZER_PLAYER_ID]) {
    await db.run('INSERT OR IGNORE INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [id, `Игрок ${id.slice(0, 4)}`, now, now]);
  }
  await db.run(`CREATE TABLE IF NOT EXISTS evening_player_votes (evening_id TEXT NOT NULL, voter_player_id TEXT NOT NULL, category TEXT NOT NULL, nominee_player_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (evening_id, voter_player_id, category))`);
  return db;
}
const vote = (db: DatabaseWrapper, voter: string, nominee: string) => db.run(
  "INSERT INTO evening_player_votes (evening_id, voter_player_id, category, nominee_player_id, created_at, updated_at) VALUES ('ev',?,'best_player',?,'2026-03-07','2026-03-07')", [voter, nominee]);

const game = (results: Array<[string, 'citizen' | 'sheriff' | 'mafia' | 'don', boolean]>): CompletedGameSnapshot => ({
  id: 'club:g', source: 'club', event_id: 'ev', date: '2026-03-06', dateMs: 0, played_at: '', title: '', game_number: 1, winner_team: 'red',
  players: results.map(([player_id, role, won], index) => ({ player_id, nickname: player_id, role, team: role === 'mafia' || role === 'don' ? 'black' : 'red', won, seat_number: index + 1 })),
});

describe('one «MVP вечера» per evening', () => {
  it('picks the most voted player', async () => {
    const db = await setup();
    await vote(db, 'v1', PLAYERS[0]); await vote(db, 'v2', PLAYERS[0]); await vote(db, 'v3', PLAYERS[1]);
    const result = await resolveEveningMvp(db, 'ev', []);
    expect(result.status === 'winner' && result.source === 'votes' && result.winner.player_id).toBe(PLAYERS[0]);
  });

  it('has no winner without votes', async () => {
    const db = await setup();
    expect((await resolveEveningMvp(db, 'ev', [])).status).toBe('none');
  });

  it('breaks a tie by wins of the evening, then by wins as Дон/Шериф, then asks the owner', async () => {
    const db = await setup();
    await vote(db, 'v1', PLAYERS[0]); await vote(db, 'v2', PLAYERS[1]);
    // More wins decide.
    const byWins = await resolveEveningMvp(db, 'ev', [game([[PLAYERS[0], 'citizen', true], [PLAYERS[1], 'citizen', false]])]);
    expect(byWins.status === 'winner' && byWins.source === 'wins' && byWins.winner.player_id).toBe(PLAYERS[0]);
    // Equal wins: the one who won as a key role.
    const byKey = await resolveEveningMvp(db, 'ev', [game([[PLAYERS[0], 'citizen', true], [PLAYERS[1], 'sheriff', true]])]);
    expect(byKey.status === 'winner' && byKey.source === 'key_roles' && byKey.winner.player_id).toBe(PLAYERS[1]);
    // Still equal: the owner decides.
    const tie = await resolveEveningMvp(db, 'ev', [game([[PLAYERS[0], 'citizen', true], [PLAYERS[1], 'citizen', true]])]);
    expect(tie.status).toBe('tie');
    expect(tie.candidates.map((item) => item.player_id).sort()).toEqual([PLAYERS[0], PLAYERS[1]]);
  });

  it('lets only the owner decide a tie, by the start of the player id', async () => {
    const db = await setup();
    await vote(db, 'v1', PLAYERS[0]); await vote(db, 'v2', PLAYERS[1]);
    expect(await decideEveningMvp(db, 'ev', PLAYERS[2], PLAYERS[0])).toEqual({ ok: false, code: 'forbidden' });
    expect(await decideEveningMvp(db, 'ev', PRIMARY_ORGANIZER_PLAYER_ID, PLAYERS[3])).toEqual({ ok: false, code: 'bad_nominee' });
    const done = await decideEveningMvp(db, 'ev', PRIMARY_ORGANIZER_PLAYER_ID, PLAYERS[1].slice(0, 6));
    expect(done.ok && done.winner.player_id).toBe(PLAYERS[1]);
    const result = await resolveEveningMvp(db, 'ev', []);
    expect(result.status === 'winner' && result.source === 'owner' && result.winner.player_id).toBe(PLAYERS[1]);
  });

  it('refuses a decision when the vote already has a clear winner', async () => {
    const db = await setup();
    await vote(db, 'v1', PLAYERS[0]); await vote(db, 'v2', PLAYERS[0]);
    expect(await decideEveningMvp(db, 'ev', PRIMARY_ORGANIZER_PLAYER_ID, PLAYERS[0])).toEqual({ ok: false, code: 'not_tie' });
  });

  it('fits Telegram callback data', () => {
    const data = mvpDecisionCallbackData('11111111-2222-3333-4444-555555555555', 'fad23405-9715-566f-acd9-5632c30eb198');
    expect(data && Buffer.byteLength(data, 'utf8') <= 64).toBe(true);
    expect(data?.startsWith('mvw:')).toBe(true);
  });
});
