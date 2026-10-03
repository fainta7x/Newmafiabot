import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { loadTournamentGameBlank } from '../server/services/clubResultData.ts';
import { runClubResultPosts } from '../server/services/clubResultPostService.ts';
import { ensurePersonalNotificationRoutingSchema } from '../db/ensurePersonalNotificationRoutingSchema.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

const START = '2026-10-03T08:00:00.000Z'; // 11:00 Moscow

async function setup(status = 'active') {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const stamp = new Date().toISOString();
  await db.run(`INSERT INTO tournaments (id,title,date,status,chief_judge_name,created_at,updated_at) VALUES ('t','Кубок',?,?,'Чагин',?,?)`, [START, status, stamp, stamp]);
  await db.run(`INSERT OR REPLACE INTO telegram_destinations (id,name,chat_id,topic_id,active,created_at,updated_at) VALUES ('rating','Рейтинг','-100600',9,1,?,?)`, [stamp, stamp]);
  for (let i = 1; i <= 10; i += 1) {
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [`p${i}`, `Игрок ${i}`, stamp, stamp]);
    await db.run("INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES (?,?,?,?,?)", [`pt${i}`, 't', `p${i}`, `Игрок ${i}`, i]);
  }
  return db;
}

// Seat of participant i in game g: a simple rotation, so the two games differ.
const seatOf = (game: number, i: number) => ((i - 1 + (game - 1) * 3) % 10) + 1;

async function addGame(db: DatabaseWrapper, game: number, status: 'planned' | 'completed', completedAt: string | null = null) {
  await db.run('INSERT INTO tournament_games (id,tournament_id,game_number,status,completed_at) VALUES (?,?,?,?,?)', [`g${game}`, 't', game, status, completedAt]);
  for (let i = 1; i <= 10; i += 1) {
    await db.run('INSERT INTO tournament_game_seats (id,game_id,participant_id,seat_number,role) VALUES (?,?,?,?,?)', [`s${game}-${i}`, `g${game}`, `pt${i}`, seatOf(game, i), i === 1 ? 'don' : i <= 3 ? 'mafia' : i === 4 ? 'sheriff' : 'citizen']);
  }
  if (status === 'completed') {
    const stamp = new Date().toISOString();
    await db.run("INSERT INTO tournament_game_protocols (id,game_id,status,winner_team,best_move_seats_json,created_at,updated_at) VALUES (?,?,'completed','red','[]',?,?)", [`pr${game}`, `g${game}`, stamp, stamp]);
    for (let i = 1; i <= 10; i += 1) {
      await db.run('INSERT INTO tournament_game_player_results (id,game_id,participant_id,exit_type,regular_fouls,technical_fouls,judge_bonus,protocol_bonus,penalty_points,ci_points) VALUES (?,?,?,?,0,0,0,0,0,0)', [`r${game}-${i}`, `g${game}`, `pt${i}`, 'alive']);
    }
  }
}

const seatMessages = async (db: DatabaseWrapper) => { await ensurePersonalNotificationRoutingSchema(db); return db.all<any>("SELECT player_id, text FROM personal_notification_deliveries WHERE event_type = 'tournament_game_seat' ORDER BY player_id"); };
// In production the switch-on marker of the result posts is long set; a first scan creates it, and older games are never posted.
const switchOn = (db: DatabaseWrapper) => runClubResultPosts(db, (async () => new Response('{}')) as any, Date.parse(START) - 4 * 3_600_000);
const okFetch = (calls: any[]) => (async (url: string, init: any) => { calls.push({ url, form: init?.body }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }) as any;

describe('tournament game results and seat messages', () => {
  it('builds the blank of a completed tournament game with the roles and the winner', async () => {
    const db = await setup();
    await addGame(db, 1, 'completed', new Date().toISOString());
    const blank = (await loadTournamentGameBlank(db, 'g1'))!;
    expect(blank).toMatchObject({ gameNumber: '1', eveningTitle: 'Кубок', winnerTeam: 'red', scored: true });
    expect(blank.seats).toHaveLength(10);
    expect(blank.seats[0].role).toBeTruthy();
    expect(await loadTournamentGameBlank(db, 'nope')).toBeNull();
  });

  it('posts the game result to the rating group once, then tells each player the seat in the next game', async () => {
    const db = await setup();
    const done = new Date('2026-10-03T09:00:00.000Z');
    await switchOn(db);
    await addGame(db, 1, 'completed', done.toISOString());
    await addGame(db, 2, 'planned');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const calls: any[] = [];
    const at = done.getTime() + 60_000;
    await runClubResultPosts(db, okFetch(calls), at);
    const photos = calls.filter((call) => String(call.url).includes('/sendPhoto'));
    expect(photos).toHaveLength(1);
    expect(photos[0].form.get('chat_id')).toBe('-100600');
    expect(String(photos[0].form.get('caption'))).toContain('игра №1');
    const messages = await seatMessages(db);
    expect(messages).toHaveLength(10);
    const first = messages.find((row) => row.player_id === 'p1');
    expect(first.text).toContain('следующая игра №2 из 2');
    expect(first.text).toContain(`месте №${seatOf(2, 1)}`);
    await runClubResultPosts(db, okFetch(calls), at + 120_000);
    expect(calls.filter((call) => String(call.url).includes('/sendPhoto'))).toHaveLength(1);
    expect(await seatMessages(db)).toHaveLength(10);
  });

  it('still sends the seat messages when the result post cannot go out', async () => {
    const db = await setup();
    await db.run("UPDATE telegram_destinations SET active = 0 WHERE id = 'rating'");
    const done = new Date('2026-10-03T09:00:00.000Z');
    await switchOn(db);
    await addGame(db, 1, 'completed', done.toISOString());
    await addGame(db, 2, 'planned');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    await runClubResultPosts(db, okFetch([]), done.getTime() + 60_000);
    expect(await seatMessages(db)).toHaveLength(10);
  });

  it('tells the next game\'s players the seat even if the judge already opened that game', async () => {
    const db = await setup();
    const done = new Date('2026-10-03T09:00:00.000Z');
    await switchOn(db);
    await addGame(db, 1, 'completed', done.toISOString());
    await addGame(db, 2, 'planned');
    await db.run("UPDATE tournament_games SET status = 'in_progress' WHERE id = 'g2'");
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    await runClubResultPosts(db, okFetch([]), done.getTime() + 60_000);
    expect(await seatMessages(db)).toHaveLength(10);
  });

  it('sends the first game seats 30 minutes before the start and not earlier', async () => {
    const db = await setup('draft');
    await addGame(db, 1, 'planned');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    const start = Date.parse(START);
    await runClubResultPosts(db, okFetch([]), start - 40 * 60_000);
    expect(await seatMessages(db)).toHaveLength(0);
    await runClubResultPosts(db, okFetch([]), start - 29 * 60_000);
    const messages = await seatMessages(db);
    expect(messages).toHaveLength(10);
    expect(messages.find((row) => row.player_id === 'p2').text).toContain(`Игра №1: ты сидишь на месте №${seatOf(1, 2)}`);
    await runClubResultPosts(db, okFetch([]), start - 10 * 60_000);
    expect(await seatMessages(db)).toHaveLength(10);
  });
});
