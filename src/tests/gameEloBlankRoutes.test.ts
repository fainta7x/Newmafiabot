import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { loadGameBlank, seatEloLines } from '../server/services/clubResultData.ts';

// The in-app protocols show the Elo breakdown of the club's result blank (owner, 2026-10-27: «в таком формате… всё
// расписывалось в протоколах игры»): the player's game page and the organizer's protocol window, word for word.

const PLAYERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const ROLES = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  for (const id of [...PLAYERS, 'org']) {
    await db.run(`INSERT INTO players (id,nickname,lifecycle_status,source,club_role,created_at,updated_at) VALUES (?,?,'normal','manual',?,?,?)`, [id, `Игрок ${id.toUpperCase()}`, id === 'org' ? 'organizer' : 'member', now, now]);
  }
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Пятничный вечер',?,'Europe/Moscow','CASUAL','active',20,100,?,?)`, [new Date(Date.now() - 3 * 3600_000).toISOString(), now, now]);
  const envelope = {
    version: 1,
    kind: 'club_evening_protocol',
    protocol: { status: 'completed', winner_team: 'red', first_killed_participant_id: 'p2', best_moves: [{ participant_id: 'p2', seat_numbers: [8, 9, 10] }] },
    player_results: ROLES.map((role, index) => ({
      participant_id: `p${index + 1}`, player_id: PLAYERS[index], seat_number: index + 1, role,
      judge_bonus: 0, protocol_bonus: 0, regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, exit_type: 'alive',
    })),
  };
  const inserted = await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,protocol_text,slots_json,created_at)
    VALUES ('ev',1,?,'red','','Судья',?,'[]',?)`, [now, JSON.stringify(envelope), now]);
  return { db, app, gameId: String(inserted.lastID) };
}

describe('Elo breakdown in the in-app protocols', () => {
  it('the player\'s game page carries the team strength and every seat\'s blank lines', async () => {
    const { db, app, gameId } = await setup();
    const blank = await loadGameBlank(db, gameId);
    const response = await request(app).get(`/api/player/games/club%3A${gameId}`).set('Cookie', `player_token=${generatePlayerSessionToken('a')}`);
    expect(response.status).toBe(200);
    expect(response.body.game.elo_table).toEqual(blank!.table);
    expect(response.body.players.map((player: any) => player.elo_lines)).toEqual(blank!.seats.map((seat) => seatEloLines(seat)));
    expect(response.body.players[1].elo_lines.some((line: string) => line.startsWith('Лучший ход:'))).toBe(true);
  });

  it('the organizer\'s protocol window reads the same blank; a player cannot', async () => {
    const { db, app, gameId } = await setup();
    const blank = await loadGameBlank(db, gameId);
    const response = await request(app).get(`/api/games/${gameId}/elo-blank`).set('Cookie', `organizer_token=${generateOrganizerToken()}`);
    expect(response.status).toBe(200);
    expect(response.body.table).toEqual(blank!.table);
    expect(response.body.seats.map((seat: any) => [seat.seat, seat.eloDelta, seat.lines])).toEqual(blank!.seats.map((seat) => [seat.seat, seat.eloDelta, seatEloLines(seat)]));
    expect((await request(app).get(`/api/games/${gameId}/elo-blank`).set('Cookie', `player_token=${generatePlayerSessionToken('a')}`)).status).toBe(401);
  });
});
