import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';
import { generateOrganizerToken } from '../server/auth';

describe('canonical evening settlement', () => {
  let db: DatabaseWrapper;
  let app: any;
  let cookie: string;

  const now = '2026-08-14T17:00:00.000Z';

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    cookie = `organizer_token=${generateOrganizerToken()}`;
  });

  afterEach(() => {
    try { db.sqlite.close(); } catch {}
  });

  const insertEvening = async (id: string) => {
    await db.run(
      `INSERT INTO game_evenings
       (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES (?,?,'2026-08-14T20:00:00+03:00','Europe/Moscow','CASUAL','active',20,400,?,?)`,
      [id, `Evening ${id}`, now, now],
    );
  };

  const insertGame = async (
    eveningId: string,
    gameNumber: number,
    status: 'draft' | 'completed',
    archived = false,
    players: Array<{ participantId: string; playerId: string }> = [],
  ) => {
    const payload = {
      version: 1,
      kind: 'club_evening_protocol',
      protocol: {
        game_id: String(gameNumber),
        status,
        winner_team: status === 'completed' ? 'red' : null,
      },
      player_results: players.map((player, index) => ({
        participant_id: player.participantId,
        player_id: player.playerId,
        seat_number: index + 1,
      })),
    };
    const slots = players.map((player, index) => ({
      participant_id: player.participantId,
      player_id: player.playerId,
      seat_number: index + 1,
    }));
    await db.run(
      `INSERT INTO games
       (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at,archived_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        eveningId,
        gameNumber,
        now,
        status === 'completed' ? 'Красные' : 'draft',
        status === 'completed' ? 'Победа Красные' : 'Черновик',
        JSON.stringify(payload),
        JSON.stringify(slots),
        now,
        archived ? now : null,
      ],
    );
  };

  it("blocks closing an evening when a structured club game is still draft even though winner_team='draft'", async () => {
    const eveningId = 'settle-draft';
    await insertEvening(eveningId);
    await insertGame(eveningId, 501, 'draft');

    const response = await request(app)
      .post(`/api/evenings/${eveningId}/settle`)
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Сначала завершите все игры вечера');
    expect(response.body.unfinishedGames).toEqual([{ id: expect.any(Number), game_number: 501 }]);
    const evening = await db.get<any>('SELECT status,settled_at FROM game_evenings WHERE id=?', [eveningId]);
    expect(evening?.status).toBe('active');
    expect(evening?.settled_at).toBeNull();
  });

  it('blocks expected players whose factual attendance is still pending', async () => {
    const eveningId = 'settle-attendance';
    await insertEvening(eveningId);
    await db.run(
      `INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at)
       VALUES ('p-attendance','Attendance Player','normal','test',1000,0,?,?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO evening_participants
       (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
       VALUES ('ep-attendance',?,'p-attendance','going','going','pending','unknown','unpaid',400,0,?,?)`,
      [eveningId, now, now],
    );

    const response = await request(app)
      .post(`/api/evenings/${eveningId}/settle`)
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Не отмечена фактическая явка ожидаемых игроков');
    expect(response.body.pendingParticipants).toHaveLength(1);
  });

  it('settles completed games, ignores archived drafts, writes payments once and queues Telegram final sync', async () => {
    const eveningId = 'settle-complete';
    await insertEvening(eveningId);

    await db.run(
      `INSERT INTO players (id,nickname,lifecycle_status,source,elo,tokens,created_at,updated_at)
       VALUES ('p-paid','Paid Player','normal','test',1000,0,?,?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO evening_participants
       (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
       VALUES ('ep-paid',?,'p-paid','going','going','attended','on_time','partial',400,250,?,?)`,
      [eveningId, now, now],
    );

    const played = [{ participantId: 'ep-paid', playerId: 'p-paid' }];
    for (const gameNumber of [502, 503, 504, 505]) {
      await insertGame(eveningId, gameNumber, 'completed', false, played);
    }
    await insertGame(eveningId, 506, 'draft', true, played);

    const beforeSync = await db.get<any>(
      "SELECT version FROM telegram_sync_outbox WHERE sync_key=?",
      [`evening:${eveningId}`],
    );

    const response = await request(app)
      .post(`/api/evenings/${eveningId}/settle`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.alreadySettled).toBe(false);

    const evening = await db.get<any>('SELECT status,settled_at FROM game_evenings WHERE id=?', [eveningId]);
    expect(evening?.status).toBe('completed');
    expect(evening?.settled_at).toBeTruthy();

    const transactions = await db.all<any>(
      `SELECT type,amount FROM financial_transactions
       WHERE evening_id=? AND source_id='ep-paid'
       ORDER BY type ASC`,
      [eveningId],
    );
    expect(transactions).toEqual([
      { type: 'debt_created', amount: 150 },
      { type: 'income', amount: 250 },
    ]);

    const afterSync = await db.get<any>(
      "SELECT kind,entity_id,version FROM telegram_sync_outbox WHERE sync_key=?",
      [`evening:${eveningId}`],
    );
    expect(afterSync?.kind).toBe('evening');
    expect(afterSync?.entity_id).toBe(eveningId);
    expect(Number(afterSync?.version || 0)).toBeGreaterThan(Number(beforeSync?.version || 0));

    const replay = await request(app)
      .post(`/api/evenings/${eveningId}/settle`)
      .set('Cookie', cookie);
    expect(replay.status).toBe(200);
    expect(replay.body.alreadySettled).toBe(true);
    expect(Number((await db.get<any>(
      "SELECT COUNT(*) AS n FROM financial_transactions WHERE evening_id=? AND source_id='ep-paid'",
      [eveningId],
    ))?.n || 0)).toBe(2);
  });
});
