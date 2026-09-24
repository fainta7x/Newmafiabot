import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { registerNewPlayer } from '../server/services/playerRegistrationService.ts';
import { enforceTournamentPaymentDeadlines, paymentDeadlineText } from '../server/services/tournamentEveningService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const playerCookie = (id: string) => `player_token=${generatePlayerSessionToken(id)}`;
const HOUR = 3_600_000;
const START = Date.parse('2026-10-10T16:00:00.000Z');

async function setup(count: number) {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const app = await createApp(db);
  const players: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const { player } = await registerNewPlayer(db, { telegramUserId: String(9300 + i), nickname: `Игрок ${i + 1}` });
    await db.run("UPDATE players SET game_level = 'tournament', club_stage = 'CLUB_PLAYER' WHERE id = ?", [player.id]);
    players.push(player.id);
  }
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO tournaments (id, title, date, venue, stage, status, created_at, updated_at, entry_fee_rub, prize_fund_rub, prize_allocations_json, published_at, tournament_evening_flow)
     VALUES ('t1', 'Кубок', ?, 'Клуб', 'TOURNAMENT', 'draft', ?, ?, 2000, 0, '[]', ?, 1)`,
    [new Date(START).toISOString(), now, now, now],
  );
  const answer = (id: string, response: string) => request(app).post('/api/tournaments/evenings/t1/answer').set('Cookie', playerCookie(id)).send({ response });
  const row = (id: string) => db.get<any>('SELECT status, response FROM tournament_registrations WHERE tournament_id = ? AND player_id = ?', ['t1', id]);
  const pay = (id: string) => db.run(
    "INSERT INTO tournament_payment_claims (id, tournament_id, player_id, state, confirmed_amount_rub, updated_at) VALUES (?, 't1', ?, 'confirmed', 2000, ?)",
    [`pc-${id}`, id, now],
  );
  return { db, players, answer, row, pay };
}

describe('tournament answers', () => {
  it('gives places to «Играю» in answer order, keeps substitutes waiting, and records thinking / declined', async () => {
    const { players, answer, row } = await setup(13);
    for (const id of players.slice(0, 11)) expect((await answer(id, 'play')).status).toBe(200);
    expect((await answer(players[11], 'substitute')).body.me).toMatchObject({ status: 'reserve', response: 'substitute' });
    expect((await answer(players[12], 'thinking')).body.me).toMatchObject({ status: 'cancelled', response: 'thinking' });
    expect(await row(players[9])).toEqual({ status: 'confirmed', response: 'play' });
    expect(await row(players[10])).toEqual({ status: 'reserve', response: 'play' });

    // A place holder switching to «Не смогу» frees the place for the waiting «Играю», not the substitute.
    await answer(players[0], 'declined');
    expect(await row(players[0])).toEqual({ status: 'cancelled', response: 'declined' });
    expect(await row(players[10])).toEqual({ status: 'confirmed', response: 'play' });
    expect(await row(players[11])).toEqual({ status: 'reserve', response: 'substitute' });

    // Before the 3-day deadline a free place is not handed to a substitute.
    await answer(players[1], 'thinking');
    expect(await row(players[11])).toEqual({ status: 'reserve', response: 'substitute' });
  });

  it('releases unpaid places at 3 days, calls substitutes in, and repeats at 24 hours', async () => {
    const { db, players, answer, row, pay } = await setup(12);
    for (const id of players.slice(0, 10)) await answer(id, 'play');
    await answer(players[10], 'substitute');
    await answer(players[11], 'substitute');
    for (const id of players.slice(0, 9)) await pay(id);

    // 4 days before: only a reminder.
    await enforceTournamentPaymentDeadlines(db, START - 90 * HOUR);
    expect(await row(players[9])).toEqual({ status: 'confirmed', response: 'play' });
    expect(await db.get<any>("SELECT text FROM personal_notification_deliveries WHERE player_id = ? AND event_type = 'tournament_payment_reminder'", [players[9]])).toBeTruthy();

    // 3 days before: the unpaid player becomes a substitute, the first substitute is called in.
    await enforceTournamentPaymentDeadlines(db, START - 71 * HOUR);
    expect(await row(players[9])).toEqual({ status: 'reserve', response: 'substitute' });
    expect(await row(players[10])).toEqual({ status: 'confirmed', response: 'play' });
    const call = await db.get<any>("SELECT text FROM personal_notification_deliveries WHERE player_id = ? AND event_type = 'tournament_reserve_promoted'", [players[10]]);
    expect(call?.text).toContain(`Оплатите взнос ${(2000).toLocaleString('ru-RU')} ₽ ${paymentDeadlineText(new Date(START).toISOString(), START - 71 * HOUR)}`);
    // Running again does nothing new.
    await enforceTournamentPaymentDeadlines(db, START - 70 * HOUR);
    expect(await row(players[10])).toEqual({ status: 'confirmed', response: 'play' });

    // 24 hours before: the called-in player did not pay either, so the next substitute gets the place.
    await enforceTournamentPaymentDeadlines(db, START - 23 * HOUR);
    expect(await row(players[10])).toEqual({ status: 'reserve', response: 'substitute' });
    expect(await row(players[11])).toEqual({ status: 'confirmed', response: 'play' });
    expect(paymentDeadlineText(new Date(START).toISOString(), START - 23 * HOUR)).toBe('на месте до первой игры');
  });
});
