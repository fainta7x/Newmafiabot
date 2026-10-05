import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { loadStatGames } from '../server/services/gameStatisticsService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

const ROLES = ['citizen', 'mafia', 'sheriff', 'citizen', 'don', 'citizen', 'citizen', 'mafia', 'citizen', 'citizen'];
const ev = (seq: number, round: number, kind: string, extra: Record<string, unknown> = {}) => ({ seq, at: '2026-10-05T10:00:00Z', round, phase: 'day_voting', kind, ...extra });
const events = [
  ev(1, 1, 'nomination', { seat: 2, by: 1 }),
  ev(2, 1, 'vote', { seat: 1, target: 2, value: 1 }),
  ev(3, 1, 'vote_round_result', { value: '1:single_eliminated' }),
  ev(4, 1, 'zero_round_voted', { seat: 2 }),
  ev(5, 1, 'sheriff_check', { target: 2, phase: 'night' }),
];

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  for (let i = 1; i <= 10; i += 1) await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [`p${i}`, `Игрок ${i}`, now, now]);
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at) VALUES ('ev','Вечер',?,'Europe/Moscow','RATING','active',20,100,?,?)`, [now, now, now]);
  const envelope = (withEvents: boolean, completedAt = now) => JSON.stringify({
    version: 1, kind: 'club_evening_protocol',
    protocol: { status: 'completed', winner_team: 'red', completed_at: completedAt, ...(withEvents ? { events } : {}) },
    player_results: ROLES.map((role, index) => ({ participant_id: `pt${index + 1}`, player_id: `p${index + 1}`, seat_number: index + 1, role })),
  });
  await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,protocol_text,slots_json,created_at) VALUES ('ev',1,?,'red','','Судья',?,'[]',?)`, [now, envelope(true), now]);
  await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,protocol_text,slots_json,created_at) VALUES ('ev',2,?,'red','','Судья',?,'[]',?)`, [now, envelope(false), now]);
  return { db, app };
}

describe('statistics across games', () => {
  it('loads club games with their chronology and keeps the older ones in the total', async () => {
    const { db } = await setup();
    const games = await loadStatGames(db);
    expect(games).toHaveLength(2);
    expect(games.filter((game) => game.events.length > 0)).toHaveLength(1);
    expect(games[0].seats).toHaveLength(10);
    expect(games[0].seats.find((seat) => seat.seat === 3)).toMatchObject({ role: 'sheriff', playerId: 'p3' });
  });

  it('loads tournament games from the protocol events and the seats', async () => {
    const { db } = await setup();
    const now = new Date().toISOString();
    await db.run(`INSERT INTO tournaments (id,title,date,status,created_at,updated_at) VALUES ('t','Кубок',?,'completed',?,?)`, [now, now, now]);
    await db.run("INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES ('tpa','t','p1','Игрок 1',1)");
    await db.run("INSERT INTO tournament_games (id,tournament_id,game_number,status,winner_team,completed_at) VALUES ('tg','t',1,'completed','black',?)", [now]);
    await db.run("INSERT INTO tournament_game_seats (id,game_id,participant_id,seat_number,role) VALUES ('ts','tg','tpa',1,'don')");
    await db.run(`INSERT INTO tournament_game_protocols (id,game_id,status,events_json,created_at,updated_at) VALUES ('tgp','tg','completed',?,?,?)`, [JSON.stringify(events), now, now]);
    const tournamentGame = (await loadStatGames(db)).find((game) => game.source === 'tournament');
    expect(tournamentGame).toMatchObject({ winner: 'black' });
    expect(tournamentGame?.seats[0]).toMatchObject({ seat: 1, role: 'don', playerId: 'p1' });
    expect(tournamentGame?.events).toHaveLength(events.length);
  });

  it('gives the organizer the club overview and nobody else', async () => {
    const { app } = await setup();
    const overview = await request(app).get('/api/analytics/game-stats?period=all').set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(overview.status).toBe(200);
    expect(overview.body).toMatchObject({ games: 1, gamesTotal: 2 });
    expect(overview.body.zeroRound.blackVotedOut).toMatchObject({ count: 1, total: 1 });
    expect((await request(app).get('/api/analytics/game-stats')).status).toBe(401);
  });
  it('bounds the latest games across both sources without a per-game seat query',async()=>{
    const {db}=await setup();
    const all=vi.spyOn(db,'all');
    const games=await loadStatGames(db,{limit:1});
    expect(games).toHaveLength(1);
    expect(all).toHaveBeenCalledTimes(2);
    expect(all.mock.calls.every(([sql])=>String(sql).includes('LIMIT ?'))).toBe(true);
    expect(await loadStatGames(db,{sinceMs:Date.now()+86400000,limit:2000})).toEqual([]);
  });
  it('attributes club games to protocol completion rather than draft creation',async()=>{
    const {db}=await setup();
    const rows=await db.all<any>('SELECT id,protocol_text FROM games ORDER BY id');
    const first=JSON.parse(rows[0].protocol_text); first.protocol.completed_at='2026-10-03T12:00:00Z';
    const second=JSON.parse(rows[1].protocol_text); second.protocol.completed_at='2020-01-03T12:00:00Z';
    await db.run("UPDATE games SET created_at='2020-01-01T00:00:00Z',protocol_text=? WHERE id=?",[JSON.stringify(first),rows[0].id]);
    await db.run("UPDATE games SET created_at='2026-10-04T00:00:00Z',protocol_text=? WHERE id=?",[JSON.stringify(second),rows[1].id]);
    const games=await loadStatGames(db,{sinceMs:Date.parse('2026-10-01T00:00:00Z'),untilMs:Date.parse('2026-10-10T00:00:00Z')});
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({id:`club:${rows[0].id}`,date:'2026-10-03T12:00:00.000Z'});
  });

  it('shows a player the numbers of his own games in his profile summary (the one profile)', async () => {
    const { app } = await setup();
    const summary = await request(app).get('/api/player/profiles/p1/summary').set('Cookie', `player_token=${generatePlayerSessionToken('p1')}`);
    expect(summary.status).toBe(200);
    expect(summary.body.game_stats).toMatchObject({ games: 1 });
    expect(summary.body.game_stats.votesAsRed).toMatchObject({ count: 1, total: 1, percent: 100 });
    expect(summary.body.season).toMatchObject({ games: expect.any(Number) });
  });
});
