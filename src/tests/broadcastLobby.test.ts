import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { getLiveBroadcastToken } from '../server/services/liveBroadcastService.ts';
import { loadBroadcastLobby } from '../server/services/broadcastLobbyService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });

async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  return { db, app };
}
const stamp = new Date().toISOString();
const protocol = (status: string, names: string[]) => JSON.stringify({
  kind: 'club_evening_protocol', protocol: { status },
  player_results: names.map((name, index) => ({ seat_number: index + 1, display_name: name, player_id: null })),
});

describe('«Заставка» and «Итоги» broadcast scenes', () => {
  it('shows the first not yet played game of today\'s evening with its seating', async () => {
    const { db, app } = await setup();
    await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
      VALUES ('ev','Пятница',?,'Europe/Moscow','CASUAL','active',20,100,?,?)`, [new Date(Date.now() - 3_600_000).toISOString(), stamp, stamp]);
    const ten = (prefix: string) => Array.from({ length: 10 }, (_, index) => `${prefix}${index + 1}`);
    await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,protocol_text,slots_json,created_at)
      VALUES ('ev',1,?,'red','Победа красных','Судья',?,'[]',?)`, [stamp, protocol('completed', ten('Сыграл')), stamp]);
    await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,protocol_text,slots_json,created_at)
      VALUES ('ev',2,?,'draft','Черновик','Судья',?,'[]',?)`, [stamp, protocol('draft', ten('Следующий')), stamp]);

    const lobby = await loadBroadcastLobby(db);
    expect(lobby.event).toMatchObject({ kind: 'evening', title: 'Пятница' });
    expect(lobby.played_games).toBe(1);
    expect(lobby.next_game?.number).toBe(2);
    expect(lobby.next_game?.seats.map((seat) => seat.nickname)[0]).toBe('Следующий1');

    await request(app).get('/api/public/broadcast/wrong/lobby').expect(404);
    const response = await request(app).get(`/api/public/broadcast/${encodeURIComponent(getLiveBroadcastToken())}/lobby`).expect(200);
    expect(response.body.next_game.seats).toHaveLength(10);
  });

  it('prefers today\'s tournament: the next planned game and the table', async () => {
    const { db } = await setup();
    const columns = new Set((await db.all<any>('PRAGMA table_info(tournaments)')).map((row: any) => row.name));
    const extra = columns.has('game_count') ? ', game_count' : '';
    await db.run(`INSERT INTO tournaments (id,title,date,status,created_at,updated_at${extra}) VALUES ('t','Кубок',?,'active',?,?${extra ? ',10' : ''})`, [new Date().toISOString(), stamp, stamp]);
    await db.run("INSERT INTO players (id,nickname,created_at,updated_at) VALUES ('a','Альфа',?,?), ('b','Бета',?,?)", [stamp, stamp, stamp, stamp]);
    await db.run("INSERT INTO tournament_participants (id,tournament_id,player_id,display_name,participant_number) VALUES ('pa','t','a','Альфа',1), ('pb','t','b','Бета',2)");
    await db.run("INSERT INTO tournament_games (id,tournament_id,game_number,status) VALUES ('g1','t',1,'completed'), ('g2','t',2,'planned')");
    await db.run("INSERT INTO tournament_game_seats (id,game_id,participant_id,seat_number) VALUES ('s1','g2','pb',1), ('s2','g2','pa',2)");
    const lobby = await loadBroadcastLobby(db);
    expect(lobby.event).toMatchObject({ kind: 'tournament', title: 'Кубок' });
    expect(lobby.next_game).toMatchObject({ number: 2, seats: [{ seat: 1, nickname: 'Бета', player_id: 'b' }, { seat: 2, nickname: 'Альфа', player_id: 'a' }] });
    expect(lobby.played_games).toBe(1);
    expect(Array.isArray(lobby.standings)).toBe(true);
  });
});
