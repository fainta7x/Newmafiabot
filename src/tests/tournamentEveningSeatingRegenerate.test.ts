import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { prepareTournamentEveningSeating } from '../server/services/tournamentEveningService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  await createApp(db);
  const stamp = new Date().toISOString();
  await db.run(`INSERT INTO tournaments (id,title,date,status,tournament_evening_flow,created_at,updated_at) VALUES ('t','Кубок',?,'draft',1,?,?)`, [stamp, stamp, stamp]);
  for (let i = 1; i <= 10; i += 1) {
    await db.run('INSERT INTO players (id,nickname,created_at,updated_at) VALUES (?,?,?,?)', [`p${i}`, `Игрок ${i}`, stamp, stamp]);
    await db.run(`INSERT INTO tournament_registrations (id,tournament_id,player_id,status,slot_number,registered_at,updated_at) VALUES (?,?,?,'confirmed',?,?,?)`, [`r${i}`, 't', `p${i}`, i, stamp, stamp]);
  }
  return db;
}

const seatCounts = async (db: DatabaseWrapper) => {
  const rows = await db.all<any>(`
    SELECT tp.player_id, s.seat_number, COUNT(*) AS c FROM tournament_game_seats s
      JOIN tournament_games g ON g.id = s.game_id JOIN tournament_participants tp ON tp.id = s.participant_id
     WHERE g.tournament_id = 't' GROUP BY tp.player_id, s.seat_number`);
  return rows;
};

describe('tournament evening seating', () => {
  it('draws a balanced seating: every player on every seat once in ten games', async () => {
    const db = await setup();
    const result = await prepareTournamentEveningSeating(db, 't', 'organizer');
    expect(result).toMatchObject({ games_count: 10, seats_count: 100, already_prepared: false });
    const rows = await seatCounts(db);
    expect(rows).toHaveLength(100);
    expect(rows.every((row) => Number(row.c) === 1)).toBe(true);
  });

  it('keeps an already prepared seating on a plain prepare, and redraws it on an explicit regenerate', async () => {
    const db = await setup();
    await prepareTournamentEveningSeating(db, 't', 'organizer');
    const before = (await db.all<any>("SELECT id FROM tournament_games WHERE tournament_id = 't' ORDER BY game_number")).map((row) => row.id);
    expect(await prepareTournamentEveningSeating(db, 't', 'organizer')).toMatchObject({ already_prepared: true });
    expect((await db.all<any>("SELECT id FROM tournament_games WHERE tournament_id = 't' ORDER BY game_number")).map((row) => row.id)).toEqual(before);

    const again = await prepareTournamentEveningSeating(db, 't', 'organizer', { regenerate: true });
    expect(again).toMatchObject({ games_count: 10, seats_count: 100, already_prepared: false });
    const after = (await db.all<any>("SELECT id FROM tournament_games WHERE tournament_id = 't' ORDER BY game_number")).map((row) => row.id);
    expect(after).toHaveLength(10);
    expect(after.some((id) => before.includes(id))).toBe(false);
    expect((await seatCounts(db)).every((row) => Number(row.c) === 1)).toBe(true);
    expect(Number((await db.get<any>("SELECT COUNT(*) AS c FROM tournament_game_seats WHERE game_id IN (SELECT id FROM tournament_games WHERE tournament_id = 't')"))?.c)).toBe(100);
  });

  it('refuses to regenerate once a game was played', async () => {
    const db = await setup();
    await prepareTournamentEveningSeating(db, 't', 'organizer');
    await db.run("UPDATE tournament_games SET status = 'completed' WHERE tournament_id = 't' AND game_number = 1");
    await expect(prepareTournamentEveningSeating(db, 't', 'organizer', { regenerate: true })).rejects.toThrow('ROSTER_LOCKED');
  });
});
