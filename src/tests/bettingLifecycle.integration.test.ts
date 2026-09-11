import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken, generatePlayerSessionToken } from '../server/auth.ts';
import {
  BettingDuplicateError,
  BettingIneligibleError,
  getPlayerBettingDashboard,
  placePoolBet,
  refundBetPool,
  settleBetPool,
} from '../server/services/bettingPoolService.ts';
import { TokenInsufficientFundsError } from '../server/services/tokenLedgerService.ts';

const roles = Array.from({ length: 10 }, (_, index) => ({
  seat_number: index + 1,
  role: index < 6 ? 'Мирный' : index === 6 ? 'Шериф' : index < 9 ? 'Мафия' : 'Дон',
}));

const protocolFor = (gameId: number) => ({
  version: 1,
  kind: 'club_evening_protocol',
  protocol: { game_id: String(gameId), status: 'draft', winner_team: null as 'red' | 'black' | null },
  player_results: Array.from({ length: 10 }, (_, index) => ({
    participant_id: `participant-${index + 1}`,
    player_id: `player-${index + 1}`,
    seat_number: index + 1,
    display_name: `Player ${index + 1}`,
    role: null,
    exit_type: 'alive',
  })),
});

describe('server-side club betting lifecycle', () => {
  let db: DatabaseWrapper;
  let app: any;
  let organizerCookie: string;
  let gameId: number;
  let secondGameId: number;
  const now = '2026-09-08T18:00:00.000Z';
  const originalLiveBettingEnabled = process.env.LIVE_BETTING_ENABLED;

  beforeEach(async () => {
    process.env.LIVE_BETTING_ENABLED = 'true';
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    organizerCookie = `organizer_token=${generateOrganizerToken()}`;

    for (let index = 1; index <= 10; index += 1) {
      await db.run(
        `INSERT INTO players (id,nickname,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at)
         VALUES (?,?,'normal','normal','none',1000,500,?,?)`,
        [`player-${index}`, `Player ${index}`, now, now],
      );
    }
    await db.run(
      `INSERT INTO players (id,nickname,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at)
       VALUES ('judge','Judge','normal','normal','host',1000,500,?,?),
              ('spectator-red','Spectator red','normal','normal','none',1000,1000,?,?),
              ('spectator-black','Spectator black','normal','normal','none',1000,1000,?,?),
              ('spectator-low','Spectator low','normal','normal','none',1000,20,?,?)`,
      [now, now, now, now, now, now, now, now],
    );
    await db.run(
      `INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('bet-evening','Bet evening',?,'Europe/Moscow','CASUAL','active',20,400,?,?)`,
      [now, now, now],
    );

    const first = await db.run(
      `INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,judge_player_id,protocol_text,slots_json,created_at)
       VALUES ('bet-evening',301,?,'draft','Черновик','Judge','judge',?,'[]',?)`,
      [now, JSON.stringify(protocolFor(301)), now],
    );
    gameId = Number(first.lastID);
    await db.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(protocolFor(gameId)), gameId]);

    const second = await db.run(
      `INSERT INTO games (evening_id,global_game_number,game_date,winner_team,winner_label,judge_name,judge_player_id,protocol_text,slots_json,created_at)
       VALUES ('bet-evening',302,?,'draft','Черновик','Judge','judge',?,'[]',?)`,
      [now, JSON.stringify(protocolFor(302)), now],
    );
    secondGameId = Number(second.lastID);
    await db.run('UPDATE games SET protocol_text = ? WHERE id = ?', [JSON.stringify(protocolFor(secondGameId)), secondGameId]);
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
    if (originalLiveBettingEnabled === undefined) delete process.env.LIVE_BETTING_ENABLED;
    else process.env.LIVE_BETTING_ENABLED = originalLiveBettingEnabled;
  });

  it('does not open a pool or delay game start while betting is disabled', async () => {
    process.env.LIVE_BETTING_ENABLED = 'false';
    const response = await request(app)
      .post(`/api/games/${gameId}/start`)
      .set('Cookie', organizerCookie)
      .send({ roles });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, disabled: true, pool: null });
    expect(await db.all('SELECT * FROM betting_pools WHERE game_id = ?', [gameId])).toHaveLength(0);
  });

  it('opens exactly one 90-second pool from CRM and preserves it on repeated start', async () => {
    const first = await request(app)
      .post(`/api/games/${gameId}/start`)
      .set('Cookie', organizerCookie)
      .send({ roles });
    expect(first.status).toBe(201);
    expect(first.body.created).toBe(true);
    expect(first.body.notification).toMatchObject({ eligible: 0, sent: 0 });
    expect(new Date(first.body.pool.closes_at).getTime() - new Date(first.body.pool.opens_at).getTime()).toBe(90_000);

    const repeated = await request(app)
      .post(`/api/games/${gameId}/start`)
      .set('Cookie', organizerCookie)
      .send({ roles });
    expect(repeated.status).toBe(200);
    expect(repeated.body.created).toBe(false);
    expect(repeated.body.pool.id).toBe(first.body.pool.id);
    expect(repeated.body.pool.closes_at).toBe(first.body.pool.closes_at);

    const pools = await db.all<any>('SELECT * FROM betting_pools WHERE game_id = ?', [gameId]);
    expect(pools).toHaveLength(1);
    expect(pools[0].red_pool).toBe(0);
    expect(pools[0].black_pool).toBe(0);
    expect(pools[0].notified_at).toBeNull();
  });

  it('allows the assigned host/player Live Game flow to start the same server lifecycle', async () => {
    const judgeCookie = `player_token=${generatePlayerSessionToken('judge')}`;
    const response = await request(app)
      .post(`/api/games/${secondGameId}/start`)
      .set('Cookie', judgeCookie)
      .send({ roles });
    expect(response.status).toBe(201);
    expect(response.body.created).toBe(true);
    expect(response.body.pool.game_id).toBe(secondGameId);
  });

  it('enforces eligibility and debits a successful bet exactly once', async () => {
    await request(app).post(`/api/games/${gameId}/start`).set('Cookie', organizerCookie).send({ roles }).expect(201);

    await expect(placePoolBet(db, { gameId, playerId: 'player-1', team: 'red', amount: 50, requestId: 'seat' }))
      .rejects.toBeInstanceOf(BettingIneligibleError);
    await expect(placePoolBet(db, { gameId, playerId: 'judge', team: 'red', amount: 50, requestId: 'judge' }))
      .rejects.toBeInstanceOf(BettingIneligibleError);
    await expect(placePoolBet(db, { gameId, playerId: 'spectator-low', team: 'red', amount: 50, requestId: 'low' }))
      .rejects.toBeInstanceOf(TokenInsufficientFundsError);

    const placed = await placePoolBet(db, { gameId, playerId: 'spectator-red', team: 'red', amount: 100, requestId: 'request-1' });
    expect(placed.idempotent).toBe(false);
    expect(placed.balance).toBe(900);

    const activeDashboard = await getPlayerBettingDashboard(db, 'spectator-red');
    expect(activeDashboard.active?.game_id).toBe(gameId);
    expect(activeDashboard.active?.status).toBe('open');
    expect(activeDashboard.active?.my_bet?.request_id).toBe('request-1');
    expect(activeDashboard.active?.my_bet?.team).toBe('red');
    expect(Number(activeDashboard.active?.red_coefficient)).toBeGreaterThanOrEqual(1);

    const duplicateRequest = await placePoolBet(db, { gameId, playerId: 'spectator-red', team: 'red', amount: 100, requestId: 'request-1' });
    expect(duplicateRequest.idempotent).toBe(true);
    expect(duplicateRequest.balance).toBe(900);

    await expect(placePoolBet(db, { gameId, playerId: 'spectator-red', team: 'black', amount: 100, requestId: 'request-2' }))
      .rejects.toBeInstanceOf(BettingDuplicateError);
    const balance = await db.get<any>("SELECT tokens FROM players WHERE id='spectator-red'");
    const stakeEntries = await db.all<any>("SELECT id FROM token_ledger WHERE player_id='spectator-red' AND reason_type='bet_stake'");
    expect(Number(balance?.tokens)).toBe(900);
    expect(stakeEntries).toHaveLength(1);
  });

  it('settles winnings idempotently, exposes coefficient/result, and refunds exactly once', async () => {
    await request(app).post(`/api/games/${gameId}/start`).set('Cookie', organizerCookie).send({ roles }).expect(201);
    await placePoolBet(db, { gameId, playerId: 'spectator-red', team: 'red', amount: 100, requestId: 'red-bet' });
    await placePoolBet(db, { gameId, playerId: 'spectator-black', team: 'black', amount: 100, requestId: 'black-bet' });

    const completed = protocolFor(gameId);
    completed.protocol.status = 'completed';
    completed.protocol.winner_team = 'red';
    await db.run(
      `UPDATE games SET winner_team = 'Красные', winner_label = 'Красные', protocol_text = ? WHERE id = ?`,
      [JSON.stringify(completed), gameId],
    );

    const settled = await settleBetPool(db, gameId, 'red');
    expect(settled?.status).toBe('settled');
    const redAfter = Number((await db.get<any>("SELECT tokens FROM players WHERE id='spectator-red'"))?.tokens);
    await settleBetPool(db, gameId, 'red');
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='spectator-red'"))?.tokens)).toBe(redAfter);

    const dashboard = await getPlayerBettingDashboard(db, 'spectator-red');
    const history = dashboard.history.find((item: any) => Number(item.game_id) === gameId);
    expect(history.status).toBe('won');
    expect(Number(history.payout_amount)).toBeGreaterThan(0);
    expect(Number(history.final_coefficient)).toBeGreaterThanOrEqual(1);

    await request(app).post(`/api/games/${secondGameId}/start`).set('Cookie', organizerCookie).send({ roles }).expect(201);
    await placePoolBet(db, { gameId: secondGameId, playerId: 'spectator-red', team: 'black', amount: 100, requestId: 'refund-bet' });
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='spectator-red'"))?.tokens)).toBe(redAfter - 100);
    const refunded = await refundBetPool(db, secondGameId);
    expect(refunded?.status).toBe('refunded');
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='spectator-red'"))?.tokens)).toBe(redAfter);
    await refundBetPool(db, secondGameId);
    expect(Number((await db.get<any>("SELECT tokens FROM players WHERE id='spectator-red'"))?.tokens)).toBe(redAfter);
  });
});
