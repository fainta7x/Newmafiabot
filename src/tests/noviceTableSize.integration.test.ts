import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { skipGatheredPost } from '../server/services/eveningGatheredPostService.ts';
import { allowedTableSizes, roleCountsMatchTable, tableRoleCounts, tableRolesLabel } from '../lib/tableComposition.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const cookie = () => `organizer_token=${generateOrganizerToken()}`;

async function setup(format: 'NOVICE' | 'CASUAL') {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Вечер',?,'Europe/Moscow',?,'active',20,0,?,?)`, [now, format, now, now]);
  await db.run("INSERT INTO players (id,nickname,club_role,judge_level,tokens,created_at,updated_at) VALUES ('org','Судья','organizer','judge',0,?,?)", [now, now]);
  await db.run("INSERT INTO evening_staff_assignments (evening_id,organizer_player_id,assigned_at,updated_at) VALUES ('ev','org',?,?)", [now, now]);
  await skipGatheredPost(db, 'ev', 'test');
  for (let seat = 1; seat <= 10; seat += 1) {
    await db.run("INSERT INTO players (id,nickname,game_level,tokens,created_at,updated_at) VALUES (?,?,'novice',0,?,?)", [`p${seat}`, `Игрок ${seat}`, now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES (?,?,?,'going','going','attended','on_time','waived',0,0,?,?)`, [`ep${seat}`, 'ev', `p${seat}`, now, now]);
  }
  const create = async (count: number) => Object.assign(await request(app).post('/api/games/evening/ev').set('Cookie', cookie()).send({
    judge_player_id: 'org', judge_name: 'Судья',
    seats: Array.from({ length: count }, (_, index) => ({ participant_id: `ep${index + 1}`, seat_number: index + 1 })),
  }), { app });
  const complete = (game: any, roles: string[]) => request(app).put(`/api/games/${game.id}/evening-protocol`).set('Cookie', cookie()).send({
    protocol: { ...game.club_protocol.protocol, status: 'completed', winner_team: 'red' },
    player_results: game.club_protocol.player_results.map((result: any, index: number) => ({ ...result, role: roles[index] })),
  });
  return { db, create, complete };
}

const deck = (size: number) => {
  const counts = tableRoleCounts(size);
  return [
    ...Array(counts.don).fill('don'), ...Array(counts.mafia).fill('mafia'),
    ...Array(counts.sheriff).fill('sheriff'), ...Array(counts.citizen).fill('citizen'),
  ];
};

describe('table size', () => {
  it('knows the approved compositions', () => {
    expect(allowedTableSizes('NOVICE')).toEqual([8, 9, 10]);
    expect(allowedTableSizes('CASUAL')).toEqual([10]);
    expect(allowedTableSizes('RATING')).toEqual([10]);
    expect(tableRoleCounts(10)).toEqual({ citizen: 6, sheriff: 1, mafia: 2, don: 1 });
    expect(tableRoleCounts(9)).toEqual({ citizen: 5, sheriff: 1, mafia: 2, don: 1 });
    expect(tableRoleCounts(8)).toEqual({ citizen: 5, sheriff: 1, mafia: 1, don: 1 });
    expect(tableRolesLabel(8)).toBe('5 мирных, Шериф, 1 мафия и Дон');
    expect(tableRolesLabel(10)).toBe('6 мирных, Шериф, 2 мафии и Дон');
    expect(roleCountsMatchTable({ citizen: 6, sheriff: 1, mafia: 2, don: 1 }, 9)).toBe(false);
  });

  it('runs a novice game of 8 with one mafia and settles tokens for all eight', async () => {
    const { db, create, complete } = await setup('NOVICE');
    const created = await create(8);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.club_protocol.player_results).toHaveLength(8);

    // The classic 2-mafia deck does not fit a table of 8.
    const wrong = await complete(created.body, ['don', 'mafia', 'mafia', 'sheriff', 'citizen', 'citizen', 'citizen', 'citizen']);
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toContain('5 мирных, Шериф, 1 мафия и Дон');

    const done = await complete(created.body, deck(8));
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.status).toBe('completed');
    const settled = await db.get<any>("SELECT COUNT(*) AS count FROM club_game_token_settlements WHERE game_id = ? AND subject_type = 'player'", [created.body.id]);
    expect(Number(settled.count)).toBe(8);
  });

  it('gives a novice table of 8 its OBS broadcast link', async () => {
    const { create } = await setup('NOVICE');
    const created = await create(8);
    const config = await request(created.app).get(`/api/games/${created.body.id}/broadcast-config`).set('Cookie', cookie());
    expect(config.status, JSON.stringify(config.body)).toBe(200);
  });

  it('runs a novice game of 9 with two mafia', async () => {
    const { create, complete } = await setup('NOVICE');
    const created = await create(9);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((await complete(created.body, deck(9))).status).toBe(200);
  });

  it('keeps a club evening at 10 players, and a game of 10 unchanged', async () => {
    const casual = await setup('CASUAL');
    const refused = await casual.create(8);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain('ровно 10 игроков');
    const created = await casual.create(10);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((await casual.complete(created.body, deck(10))).status).toBe(200);

    const novice = await setup('NOVICE');
    expect((await novice.create(7)).body.error).toContain('от 8 до 10 игроков');
  });
});
