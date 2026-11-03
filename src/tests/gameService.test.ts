import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { getGame, listEventGames, listGamesJudgedBy } from '../server/services/gameService.ts';
import { gameKey, parseGameKey, isFinishedGameStatus } from '../shared/game.ts';

// «Игра» — one entity for every game (owner, 2026-11-03; docs/ARCHITECTURE_REVIEW_2026-11-03.md, step 1).
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const now = '2026-11-03T18:00:00.000Z';
const protocol = (status: string, extra: Record<string, unknown> = {}) => JSON.stringify({
  kind: 'club_evening_protocol', protocol: { status, winner_team: status === 'completed' ? 'red' : null, ...extra },
  player_results: [{ seat_number: 2, player_id: 'p2', display_name: 'Матроскина', role: 'mafia' }, { seat_number: 1, player_id: 'p1', display_name: 'Богданчик', role: 'citizen' }],
});

const seed = async () => {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Рейтинговый вечер',?,'Europe/Moscow','RATING','active',20,500,?,?), ('ev-x','Отменён',?,'Europe/Moscow','CASUAL','cancelled',20,500,?,?)`, [now, now, now, now, now, now]);
  const game = (id: number, evening: string, number: number, text: string, archived: string | null = null) => db.run(
    `INSERT INTO games (id,evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at,archived_at) VALUES (?,?,?,?,'red','',?,'[]',?,?)`,
    [id, evening, number, now, text, now, archived]);
  await game(1, 'ev', 31, protocol('completed', { completed_at: now }));
  await game(2, 'ev', 32, protocol('draft'));
  await game(3, 'ev', 33, protocol('draft'));
  await game(4, 'ev', 34, protocol('completed'), now);
  await game(5, 'ev-x', 35, protocol('draft'));
  await db.run(`INSERT INTO tournaments (id,title,date,status,created_at,updated_at) VALUES ('t1','Турнир','2026-11-01','active',?,?)`, [now, now]);
  await db.run(`INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('p1','Богданчик',?,?),('p2','Матроскина',?,?)`, [now, now, now, now]);
  await db.run(`INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES ('tp1','t1','p1','Богданчик',1),('tp2','t1','p2','Матроскина',2)`);
  await db.run(`INSERT INTO tournament_games (id,tournament_id,game_number,status,winner_team) VALUES ('tg1','t1',1,'completed','black'),('tg2','t1',2,'active',NULL),('tg3','t1',3,'planned',NULL)`);
  await db.run(`INSERT INTO tournament_game_seats (id,game_id,participant_id,seat_number,role) VALUES ('s1','tg1','tp2',2,'don'),('s2','tg1','tp1',1,'sheriff')`);
  await db.run(`INSERT INTO tournament_game_protocols (id,game_id,status,winner_team,best_move_seats_json,created_at,updated_at) VALUES ('pr1','tg1','completed','black','[]',?,?)`, [now, now]);
  return db;
};

describe('one «Игра» over both tables', () => {
  it('a game of an evening: key, format of the evening, status, seats in seat order', async () => {
    const db = await seed();
    expect(await getGame(db, 'club:1')).toMatchObject({
      key: 'club:1', storage: 'club', format: 'RATING', status: 'completed', eventId: 'ev', eventKind: 'evening', number: 31, winner: 'red',
      seats: [{ seat: 1, playerId: 'p1', nickname: 'Богданчик', role: 'citizen' }, { seat: 2, playerId: 'p2', nickname: 'Матроскина', role: 'mafia' }],
    });
  });

  it('statuses of games of an evening: planned, running (server copy of the session), archived, cancelled evening', async () => {
    const db = await seed();
    await db.exec('CREATE TABLE IF NOT EXISTS live_game_checkpoints (game_key TEXT PRIMARY KEY, payload TEXT NOT NULL, saved_at TEXT NOT NULL)');
    await db.run("INSERT INTO live_game_checkpoints (game_key,payload,saved_at) VALUES ('club:3','{}',?)", [now]);
    expect((await getGame(db, 'club:2'))?.status).toBe('planned');
    expect((await getGame(db, 'club:3'))?.status).toBe('running');
    expect((await getGame(db, 'club:4'))?.status).toBe('archived');
    expect((await getGame(db, 'club:5'))?.status).toBe('cancelled');
  });

  it('a tournament game has the same shape: format TOURNAMENT, its own number and seats', async () => {
    const db = await seed();
    expect(await getGame(db, 'tournament:tg1')).toMatchObject({
      key: 'tournament:tg1', storage: 'tournament', format: 'TOURNAMENT', status: 'completed', eventId: 't1', eventKind: 'tournament', number: 1, winner: 'black',
      seats: [{ seat: 1, playerId: 'p1', role: 'sheriff' }, { seat: 2, playerId: 'p2', role: 'don' }],
    });
    expect((await getGame(db, 'tournament:tg2'))?.status).toBe('running');
    expect((await getGame(db, 'tournament:tg3'))?.status).toBe('planned');
  });

  it('lists the games of an event in playing order; unknown keys are null', async () => {
    const db = await seed();
    expect((await listEventGames(db, 'evening', 'ev')).map((g) => g.key)).toEqual(['club:1', 'club:2', 'club:3', 'club:4']);
    expect((await listEventGames(db, 'tournament', 't1')).map((g) => g.key)).toEqual(['tournament:tg1', 'tournament:tg2', 'tournament:tg3']);
    expect(await getGame(db, 'club:999')).toBeNull();
    expect(await getGame(db, 'nonsense')).toBeNull();
  });

  it('one rule for every reader: a cancelled evening wins over a protocol; a tournament game needs its protocol completed; the tournament judge counts', async () => {
    const db = await seed();
    await db.run(`UPDATE games SET protocol_text = ? WHERE id = 5`, [protocol('completed')]);
    expect((await getGame(db, 'club:5'))?.status).toBe('cancelled');
    await db.run(`INSERT INTO tournament_games (id,tournament_id,game_number,status,winner_team) VALUES ('tg4','t1',4,'completed','red')`);
    expect((await getGame(db, 'tournament:tg4'))?.status).toBe('running');
    await db.run(`UPDATE tournaments SET judge_player_id = 'p9' WHERE id = 't1'`).catch(() => {});
    const judged = await listGamesJudgedBy(db, 'p9');
    expect(judged.map((g) => g.key).sort()).toEqual(['tournament:tg1', 'tournament:tg2', 'tournament:tg3', 'tournament:tg4']);
  });

  it('keys and statuses', () => {
    expect(gameKey('club', 7)).toBe('club:7');
    expect(parseGameKey('tournament:abc')).toEqual({ storage: 'tournament', id: 'abc' });
    expect(parseGameKey('club:abc')).toBeNull();
    expect(['completed', 'cancelled', 'archived'].every((s) => isFinishedGameStatus(s as any))).toBe(true);
    expect(isFinishedGameStatus('running')).toBe(false);
  });
});
