import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { gameResultPoints, inviteFriendUrl } from '../server/services/gameResultCardService.ts';
import { ensurePersonalNotificationRoutingSchema } from '../db/ensurePersonalNotificationRoutingSchema.ts';
import { reconcilePersonalNotifications } from '../server/services/personalTelegramNotificationService.ts';

const opened: DatabaseWrapper[] = [];
afterEach(() => { while (opened.length) opened.pop()?.sqlite.close(); vi.unstubAllEnvs(); });

const ROLES = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
const envelope = (winner: 'red' | 'black', extra: Record<string, unknown> = {}, seatOne: Record<string, unknown> = {}) => ({
  kind: 'club_evening_protocol',
  protocol: { status: 'completed', winner_team: winner, ...extra },
  player_results: ROLES.map((role, index) => ({
    participant_id: `p${index + 1}`, player_id: index === 0 ? 'hero' : null, seat_number: index + 1, role,
    judge_bonus: 0, protocol_bonus: 0, ...(index === 0 ? seatOne : {}),
  })),
});

async function setup(format = 'RATING') {
  const db = createDatabaseConnection(':memory:'); opened.push(db);
  const now = new Date().toISOString();
  await db.run(`INSERT INTO players (id,nickname,telegram_user_id,lifecycle_status,source,created_at,updated_at)
    VALUES ('hero','Герой','100','normal','telegram',?,?)`, [now, now]);
  await db.run(`INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
    VALUES ('ev','Пятничная мафия',?,'Europe/Moscow',?,'active',20,100,?,?)`, [now, format, now, now]);
  const addGame = async (number: number, body: unknown) => {
    const inserted = await db.run(`INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,protocol_text,slots_json,created_at)
      VALUES ('ev',?,?,'red','Победа','Судья',?,'[]',?)`, [number, now, JSON.stringify(body), now]);
    return Number(inserted.lastID);
  };
  return { db, addGame };
}

describe('game result card in the bot', () => {
  it('counts the game points like the rating table: win, judge bonus, best move, discipline', () => {
    const body = envelope('red', { first_killed_participant_id: 'p1', best_moves: [{ participant_id: 'p1', seat_numbers: [8, 9, 10] }] }, { judge_bonus: 0.3 });
    const points = gameResultPoints(body, body.player_results[0]);
    expect(points.win).toBe(1);
    expect(points.bestMove).toBeGreaterThan(0);
    expect(points.total).toBeCloseTo(1 + 0.3 + points.bestMove, 2);
    const removed = envelope('black', {}, { exit_type: 'removed' });
    expect(gameResultPoints(removed, removed.player_results[0]).total).toBeLessThan(0);
  });

  it('the invite link opens the bot with the inviter, and there is none without the bot name', async () => {
    expect(decodeURIComponent(String(await inviteFriendUrl('hero', 'NoireBot')))).toContain('https://t.me/NoireBot?start=ref_hero');
    expect(await inviteFriendUrl('hero', null)).toBeNull();
  });

  it('the worker no longer sends a personal message after each club game', async () => {
    const { db, addGame } = await setup();
    await createApp(db);
    await addGame(7, envelope('red'));
    await reconcilePersonalNotifications(db);
    await ensurePersonalNotificationRoutingSchema(db);
    expect(await db.all("SELECT 1 FROM personal_notification_deliveries WHERE event_type IN ('game_result', 'elo_change')")).toHaveLength(0);
  });
});

describe('«Позвать друга» link', () => {
  it('records who brought a new player and tells the inviter, once', async () => {
    vi.stubEnv('BOT_API_SECRET', 'bot-secret');
    const { db } = await setup();
    const app = await createApp(db);
    const register = (telegram: string, nickname: string, invitedBy?: string) => request(app)
      .post('/api/bot/players/register').set('X-Bot-Token', 'bot-secret')
      .send({ telegram_user_id: telegram, nickname, ...(invitedBy ? { invited_by: invitedBy } : {}) });

    const friend = await register('200', 'Друг', 'hero');
    expect(friend.status).toBe(201);
    const friendId = String(friend.body.player.id);
    expect(await db.get<any>('SELECT inviter_player_id, source FROM player_referrals WHERE invited_player_id = ?', [friendId]))
      .toEqual({ inviter_player_id: 'hero', source: 'invite_link' });
    const thanks = await db.get<any>("SELECT player_id, text FROM personal_notification_deliveries WHERE event_type = 'invite_link_joined'");
    expect(thanks).toMatchObject({ player_id: 'hero' });
    expect(thanks.text).toContain('Друг');

    // An unknown inviter or an already registered player changes nothing.
    const stranger = await register('300', 'Незнакомец', 'nobody');
    expect(await db.get('SELECT 1 FROM player_referrals WHERE invited_player_id = ?', [String(stranger.body.player.id)])).toBeFalsy();
    const again = await register('200', 'Друг', 'hero');
    expect(again.body.created).toBe(false);
    expect((await db.all("SELECT 1 FROM personal_notification_deliveries WHERE event_type = 'invite_link_joined'"))).toHaveLength(1);
  });
});
