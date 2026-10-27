import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { skipGatheredPost } from '../server/services/eveningGatheredPostService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const roles = ['citizen', 'mafia', 'citizen', 'citizen', 'don', 'citizen', 'citizen', 'sheriff', 'citizen', 'mafia'];
const names = ['Пристань', 'Диссонанс', 'Богданчик', 'Перец', 'Алоэ', 'Jin', 'Серый', 'ФМ', 'Дина', 'Денди'];

/** A draft club game with the stamp of game №17's last save (the record itself is a valid finished game). */
async function setup() {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Вечер',?,'Europe/Moscow','CASUAL','active',20,0,?,?)`, [now, now, now]);
  await db.run("INSERT INTO players (id,nickname,club_role,judge_level,tokens,created_at,updated_at) VALUES ('org','Судья','organizer','judge',0,?,?)", [now, now]);
  await db.run("INSERT INTO evening_staff_assignments (evening_id,organizer_player_id,assigned_at,updated_at) VALUES ('ev','org',?,?)", [now, now]);
  await skipGatheredPost(db, 'ev', 'test');
  for (let seat = 1; seat <= 10; seat += 1) {
    await db.run("INSERT INTO players (id,nickname,game_level,tokens,created_at,updated_at) VALUES (?,?,'novice',0,?,?)", [`p${seat}`, names[seat - 1], now, now]);
    await db.run(`INSERT INTO evening_participants (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES (?,?,?,'going','going','attended','on_time','paid',200,200,?,?)`, [`ep${seat}`, 'ev', `p${seat}`, now, now]);
  }
  const created = await request(app).post('/api/games/evening/ev').set('Cookie', `organizer_token=${generateOrganizerToken()}`).send({
    judge_player_id: 'org', judge_name: 'Судья',
    seats: Array.from({ length: 10 }, (_, index) => ({ participant_id: `ep${index + 1}`, seat_number: index + 1 })),
  });
  const id = created.body.id;
  const stored = JSON.parse((await db.get<any>('SELECT protocol_text FROM games WHERE id = ?', [id])).protocol_text);
  const exits: Record<number, string> = { 4: 'voted_day', 9: 'killed' };
  stored.player_results = stored.player_results.map((r: any) => ({ ...r, display_name: names[r.seat_number - 1], role: roles[r.seat_number - 1], exit_type: exits[r.seat_number] || 'alive', notes: r.seat_number === 3 ? 'Голосование (День 3)' : null }));
  stored.protocol = {
    ...stored.protocol, status: 'draft', end_reason: 'ppk', ppk_culprit_participant_id: 'ep10', winner_team: 'red', zero_round_rule: 'club',
    first_killed_participant_id: 'ep9', best_move_participant_id: 'ep9', best_move_source: 'first_killed', best_move_seats: [4, 6, 10],
    best_moves: [{ participant_id: 'ep9', source: 'first_killed', seat_numbers: [4, 6, 10] }],
    votes: [
      { round_number: 1, is_revote: false, nominated_seats: [1, 2, 3], vote_counts: { 1: 5, 2: 0, 3: 5 }, day_number: 0, eligible_voters: 10, outcome: 'tie_revote', eliminated_seats: [], table_leave_votes: null },
      { round_number: 2, is_revote: true, nominated_seats: [1, 3], vote_counts: { 1: 5, 3: 5 }, day_number: 0, eligible_voters: 10, parent_round_number: 1, parent_nominated_seats: [1, 2, 3], parent_vote_counts: { 1: 5, 2: 0, 3: 5 }, outcome: 'no_elimination', eliminated_seats: [], table_leave_votes: 1 },
      { round_number: 3, is_revote: false, nominated_seats: [10, 2, 4, 5], vote_counts: { 2: 3, 4: 3, 5: 1, 10: 2 }, day_number: 1, eligible_voters: 9, outcome: 'tie_revote', eliminated_seats: [], table_leave_votes: null },
      { round_number: 4, is_revote: true, nominated_seats: [2, 4], vote_counts: { 2: 4, 4: 5 }, day_number: 1, eligible_voters: 9, parent_round_number: 3, parent_nominated_seats: [10, 2, 4, 5], parent_vote_counts: { 2: 3, 4: 3, 5: 1, 10: 2 }, outcome: 'single_eliminated', eliminated_seats: [4], table_leave_votes: null },
      { round_number: 5, is_revote: false, nominated_seats: [3, 5], vote_counts: { 3: 4, 5: 4 }, day_number: 2, eligible_voters: 8, outcome: 'tie_revote', eliminated_seats: [], table_leave_votes: null },
      { round_number: 6, is_revote: true, nominated_seats: [3, 5], vote_counts: { 3: 4, 5: 4 }, day_number: 2, eligible_voters: 8, parent_round_number: 5, parent_nominated_seats: [3, 5], parent_vote_counts: { 3: 4, 5: 4 }, outcome: 'no_elimination', eliminated_seats: [], table_leave_votes: 0 },
    ],
    shots: [{ night_number: 1, target_seat: 9, result: 'killed' }, { night_number: 2, target_seat: 0, result: 'agreement_failed' }, { night_number: 3, target_seat: 0, result: 'agreement_failed' }],
  };
  stored.protocol.updated_at = '2026-10-26T12:57:30.390Z';
  await db.run('UPDATE games SET protocol_text = ?, global_game_number = 17 WHERE id = ?', [JSON.stringify(stored), id]);
  const read = async () => JSON.parse((await db.get<any>('SELECT protocol_text FROM games WHERE id = ?', [id])).protocol_text);
  return { db, app, id, stored, read };
}

const cookie = () => `organizer_token=${generateOrganizerToken()}`;

// Owner, 2026-10-27: game №17 of 23.10 stayed a draft after a correction and was missing from ten profiles unnoticed.
describe('organizer «Сегодня»: unfinished games of past evenings', () => {
  it('lists a draft game of a past evening until it is completed', async () => {
    const { db, app, id, stored } = await setup();
    await db.run("UPDATE game_evenings SET starts_at = ? WHERE id = 'ev'", [new Date(Date.now() - 4 * 24 * 3600_000).toISOString()]);
    const listed = await request(app).get('/api/crm/command-center').set('Cookie', cookie());
    expect(listed.status).toBe(200);
    expect(listed.body.unfinished_games).toEqual([{ id, global_number: 17, evening: expect.objectContaining({ id: 'ev', title: 'Вечер' }) }]);
    stored.protocol.status = 'completed';
    await db.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(stored), id]);
    expect((await request(app).get('/api/crm/command-center').set('Cookie', cookie())).body.unfinished_games).toEqual([]);
  });

  it('does not remind about tonight\'s games while the evening is on', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/crm/command-center').set('Cookie', cookie())).body.unfinished_games).toEqual([]);
  });
});
