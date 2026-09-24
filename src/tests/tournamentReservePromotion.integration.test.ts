import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generatePlayerSessionToken } from '../server/auth.ts';
import { registerNewPlayer } from '../server/services/playerRegistrationService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); });
const playerCookie = (id: string) => `player_token=${generatePlayerSessionToken(id)}`;

describe('tournament registration reserve', () => {
  it('fills 10 places first-come, promotes the first reserve on a cancellation and tells them what to do', async () => {
    const db = createDatabaseConnection(':memory:'); opened.push(db);
    const app = await createApp(db);
    const players: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const { player } = await registerNewPlayer(db, { telegramUserId: String(9100 + i), nickname: `Турнирный ${i + 1}` });
      await db.run("UPDATE players SET game_level = 'tournament', club_stage = 'CLUB_PLAYER' WHERE id = ?", [player.id]);
      players.push(player.id);
    }
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO tournaments (id, title, date, venue, stage, status, created_at, updated_at, entry_fee_rub, prize_fund_rub, prize_allocations_json, published_at, tournament_evening_flow)
       VALUES ('t1', 'Осенний кубок', '2026-10-10T15:00:00.000Z', 'Суп с Котом', 'TOURNAMENT', 'draft', ?, ?, 500, 0, '[]', ?, 1)`,
      [now, now, now],
    );

    for (const id of players) {
      const response = await request(app).post('/api/tournaments/evenings/t1/register').set('Cookie', playerCookie(id));
      expect(response.status).toBe(200);
    }
    const statuses = await db.all<any>('SELECT player_id, status, queue_order FROM tournament_registrations WHERE tournament_id = ? ORDER BY registered_at, id', ['t1']);
    expect(statuses.filter((row) => row.status === 'confirmed')).toHaveLength(10);
    expect(statuses.find((row) => row.player_id === players[10])).toMatchObject({ status: 'reserve', queue_order: 1 });

    const cancelled = await request(app).post('/api/tournaments/evenings/t1/cancel-registration').set('Cookie', playerCookie(players[0]));
    expect(cancelled.status).toBe(200);
    expect(await db.get<any>('SELECT status FROM tournament_registrations WHERE player_id = ?', [players[10]])).toMatchObject({ status: 'confirmed' });
    const notice = await db.get<any>("SELECT text FROM personal_notification_deliveries WHERE player_id = ? AND event_type = 'tournament_reserve_promoted'", [players[10]]);
    expect(notice?.text).toContain('«Осенний кубок»');
    expect(notice?.text).toContain('10 октября');
    expect(notice?.text).toContain('Оплатите взнос 500 ₽');

    // The same player can be promoted again later (cancel -> reserve -> vacancy) and must be told again.
    await request(app).post('/api/tournaments/evenings/t1/cancel-registration').set('Cookie', playerCookie(players[10]));
    await request(app).post('/api/tournaments/evenings/t1/register').set('Cookie', playerCookie(players[10]));
    expect(await db.get<any>('SELECT status FROM tournament_registrations WHERE player_id = ?', [players[10]])).toMatchObject({ status: 'reserve' });
    await request(app).post('/api/tournaments/evenings/t1/cancel-registration').set('Cookie', playerCookie(players[1]));
    const notices = await db.all<any>("SELECT notification_key FROM personal_notification_deliveries WHERE player_id = ? AND event_type = 'tournament_reserve_promoted'", [players[10]]);
    expect(notices.length).toBeGreaterThanOrEqual(2);
  });
});
