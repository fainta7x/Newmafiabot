import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import { buildPlayerConnectionSummary } from '../server/services/playerConnectionService.ts';
import type { CompletedGameSnapshot } from '../server/services/clubGameAnalyticsService.ts';

const snapshot = (
  id: string,
  winner: 'red' | 'black',
  targetTeam: 'red' | 'black',
  otherTeam: 'red' | 'black',
): CompletedGameSnapshot => ({
  id,
  source: 'club',
  event_id: 'evening-history',
  date: '2026-09-01T18:00:00.000Z',
  dateMs: Date.parse('2026-09-01T18:00:00.000Z'),
  played_at: '2026-09-01T18:00:00.000Z',
  title: 'Исторический вечер',
  game_number: Number(id.replace(/\D/g, '')) || 1,
  winner_team: winner,
  players: [
    { player_id: 'target', nickname: 'Target', role: targetTeam === 'red' ? 'citizen' : 'mafia', team: targetTeam, won: targetTeam === winner, seat_number: 1 },
    { player_id: 'other', nickname: 'Other', role: otherTeam === 'red' ? 'citizen' : 'mafia', team: otherTeam, won: otherTeam === winner, seat_number: 2 },
  ],
});

describe('player connections analytics', () => {
  it('separates same-team games from opponent games using completed snapshots only', () => {
    const result = buildPlayerConnectionSummary([
      snapshot('game-1', 'red', 'red', 'red'),
      snapshot('game-2', 'black', 'red', 'black'),
      snapshot('game-3', 'red', 'red', 'black'),
    ], 'target');

    expect(result.shared_players).toBe(1);
    expect(result.teammates[0]).toMatchObject({ player_id: 'other', same_team_games: 1, same_team_wins: 1 });
    expect(result.opponents[0]).toMatchObject({
      player_id: 'other',
      opponent_games: 2,
      target_wins_vs_player: 1,
      player_wins_vs_target: 1,
    });
  });
});

describe('player evening invitations', () => {
  let db: DatabaseWrapper;
  let app: any;
  let inviterCookie: string;
  let invitedCookie: string;
  let organizerCookie: string;
  let future: string;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    inviterCookie = `player_token=${generatePlayerSessionToken('inviter')}`;
    invitedCookie = `player_token=${generatePlayerSessionToken('invited')}`;
    organizerCookie = `organizer_token=${generateOrganizerToken()}`;
    future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    await db.run(`
      INSERT INTO players (id, nickname, telegram_user_id, game_level, contact_status, lifecycle_status, judge_level, elo, tokens, created_at, updated_at)
      VALUES
        ('inviter', 'Приглашающий', NULL, 'club', 'normal', 'normal', 'none', 1000, 500, ?, ?),
        ('invited', 'Приглашённый', '777001', 'club', 'normal', 'normal', 'none', 1000, 500, ?, ?),
        ('novice', 'Новичок', NULL, 'novice', 'normal', 'normal', 'none', 1000, 500, ?, ?)
    `, [now, now, now, now, now, now]);

    await db.run(`
      INSERT INTO game_evenings (id, title, starts_at, timezone, format, status, capacity, default_price, created_at, updated_at)
      VALUES
        ('casual-evening', 'Клубный вечер', ?, 'Europe/Moscow', 'CASUAL', 'published', 20, 400, ?, ?),
        ('rating-evening', 'Рейтинговый вечер', ?, 'Europe/Moscow', 'RATING', 'published', 20, 400, ?, ?)
    `, [future, now, now, future, now, now]);
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  it('creates one durable invite, exposes it in-app and deduplicates repeated taps', async () => {
    const first = await request(app)
      .post('/api/player/evenings/casual-evening/invite-player')
      .set('Cookie', inviterCookie)
      .send({ player_id: 'invited' });
    expect(first.status).toBe(201);
    expect(first.body.duplicate).toBe(false);

    const repeated = await request(app)
      .post('/api/player/evenings/casual-evening/invite-player')
      .set('Cookie', inviterCookie)
      .send({ player_id: 'invited' });
    expect(repeated.status).toBe(200);
    expect(repeated.body.duplicate).toBe(true);

    const inviteRows = await db.all<any>(`SELECT * FROM player_evening_invites WHERE evening_id='casual-evening'`);
    expect(inviteRows).toHaveLength(1);
    const outboxRows = await db.all<any>(`SELECT message_key, status FROM telegram_message_outbox WHERE event_type='player_evening_invite'`);
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0].message_key).toBe('player-evening-invite:casual-evening:inviter:invited');

    const notifications = await request(app).get('/api/player/notifications').set('Cookie', invitedCookie);
    expect(notifications.status).toBe(200);
    expect(notifications.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'player_evening_invite', title: 'Личное приглашение', action: { kind: 'events', target: 'casual-evening' } }),
    ]));
  });

  it('rejects self-invites and formats unavailable to the invited player', async () => {
    await request(app)
      .post('/api/player/evenings/casual-evening/invite-player')
      .set('Cookie', inviterCookie)
      .send({ player_id: 'inviter' })
      .expect(400);

    const noviceCookie = `player_token=${generatePlayerSessionToken('novice')}`;
    const unavailable = await request(app)
      .post('/api/player/evenings/rating-evening/invite-player')
      .set('Cookie', inviterCookie)
      .send({ player_id: 'novice' });
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.error).toContain('недоступен формат');

    const ownAttempt = await request(app)
      .post('/api/player/evenings/rating-evening/invite-player')
      .set('Cookie', noviceCookie)
      .send({ player_id: 'novice' });
    expect(ownAttempt.status).toBe(400);
  });

  it('allows only organizers to maintain the historical referrer relationship', async () => {
    const playerAttempt = await request(app)
      .put('/api/player/profiles/invited/referrer')
      .set('Cookie', inviterCookie)
      .send({ inviter_player_id: 'inviter' });
    expect([401, 403]).toContain(playerAttempt.status);

    await request(app)
      .put('/api/player/profiles/invited/referrer')
      .set('Cookie', organizerCookie)
      .send({ inviter_player_id: 'inviter' })
      .expect(200);

    const profile = await request(app)
      .get('/api/player/profiles/invited/connections')
      .set('Cookie', invitedCookie);
    expect(profile.status).toBe(200);
    expect(profile.body.invited_by).toMatchObject({ player_id: 'inviter', nickname: 'Приглашающий' });
  });
});
