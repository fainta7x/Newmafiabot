import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { skipGatheredPost } from '../server/services/eveningGatheredPostService.ts';
import { correctGame20EightSplit } from '../server/dataMigrations/correctGame20EightSplit.ts';
import { validateVotes } from '../lib/protocolVotingValidation.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const names = ['Пристань', 'Диссонанс', 'Богданчик', 'Перец', 'Алоэ', 'Jin', 'Серый', 'ФМ', 'Дина', 'Денди'];

/** A club game shaped like the record of game №20 as read on 2026-10-27. */
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
  stored.player_results = stored.player_results.map((r: any) => ({ ...r, display_name: names[r.seat_number - 1], exit_type: exits[r.seat_number] || 'alive' }));
  stored.protocol = {
    ...stored.protocol, status: 'completed', end_reason: 'ppk', winner_team: 'red',
    votes: [
      { round_number: 1, is_revote: false, nominated_seats: [1, 2, 3], vote_counts: { 1: 5, 2: 0, 3: 5 }, day_number: 0, eligible_voters: 10, outcome: 'tie_revote', eliminated_seats: [], table_leave_votes: null },
      { round_number: 2, is_revote: true, nominated_seats: [1, 3], vote_counts: { 1: 5, 3: 5 }, day_number: 0, eligible_voters: 10, parent_round_number: 1, parent_nominated_seats: [1, 2, 3], parent_vote_counts: { 1: 5, 2: 0, 3: 5 }, outcome: 'no_elimination', eliminated_seats: [], table_leave_votes: 1 },
      { round_number: 3, is_revote: false, nominated_seats: [10, 2, 4, 5], vote_counts: { 2: 3, 4: 3, 5: 1, 10: 2 }, day_number: 1, eligible_voters: 9, outcome: 'tie_revote', eliminated_seats: [], table_leave_votes: null },
      { round_number: 4, is_revote: true, nominated_seats: [2, 4], vote_counts: { 2: 4, 4: 5 }, day_number: 1, eligible_voters: 9, parent_round_number: 3, parent_nominated_seats: [10, 2, 4, 5], parent_vote_counts: { 2: 3, 4: 3, 5: 1, 10: 2 }, outcome: 'single_eliminated', eliminated_seats: [4], table_leave_votes: null },
    ],
    shots: [{ night_number: 1, target_seat: 9, result: 'killed' }, { night_number: 2, target_seat: 0, result: 'agreement_failed' }, { night_number: 3, target_seat: 0, result: 'agreement_failed' }],
  };
  await db.run('UPDATE games SET protocol_text = ?, global_game_number = 20 WHERE id = ?', [JSON.stringify(stored), id]);
  const read = async () => JSON.parse((await db.get<any>('SELECT protocol_text FROM games WHERE id = ?', [id])).protocol_text);
  return { db, id, stored, read };
}

describe('game №20: the split of the восьмёрка after the miss (owner, 2026-10-27)', () => {
  it('adds the two tied rounds with everybody staying, puts the misses back and keeps the old values', async () => {
    const { db, id, stored, read } = await setup();
    expect(await correctGame20EightSplit(db)).toEqual({ applied: true });
    const after = await read();
    expect(after.protocol.votes.slice(4)).toMatchObject([
      { round_number: 5, day_number: 2, nominated_seats: [5, 8, 2, 3], vote_counts: { 5: 4, 3: 4 }, outcome: 'tie_revote' },
      { round_number: 6, day_number: 2, is_revote: true, parent_round_number: 5, nominated_seats: [5, 3], vote_counts: { 5: 4, 3: 4 }, outcome: 'no_elimination', eliminated_seats: [], table_leave_votes: 0 },
    ]);
    expect(validateVotes(after.protocol.votes, true, after.player_results)).toBeNull();
    expect(after.protocol.shots.map((s: any) => s.result)).toEqual(['killed', 'miss', 'miss']);
    expect(after.player_results).toEqual(stored.player_results);
    const history = await db.get<any>("SELECT status, details_json FROM migration_history WHERE migration_name = '2026-10-game20-eight-split-v1'");
    expect(history.status).toBe('completed');
    expect(JSON.parse(history.details_json)).toMatchObject({ game_id: id, before: { votes: stored.protocol.votes, shots: stored.protocol.shots } });
    expect(await correctGame20EightSplit(db)).toEqual({ applied: false, reason: 'completed' });
  });

  it('changes nothing when the record is not the one read on 2026-10-27', async () => {
    const { db, id, stored, read } = await setup();
    stored.protocol.votes = stored.protocol.votes.slice(0, 3);
    await db.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(stored), id]);
    expect(await correctGame20EightSplit(db)).toEqual({ applied: false, reason: 'skipped' });
    expect(await read()).toEqual(stored);
  });
});
