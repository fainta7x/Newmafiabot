import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.ts';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { generateOrganizerToken } from '../server/auth.ts';
import { reconcilePersonalTelegramNotifications } from '../server/services/personalTelegramNotificationService.ts';
import { resolveOrganizerNotificationRecipients } from '../server/services/organizerNotificationService.ts';
import {
  drainTelegramMessageOutbox,
  enqueueTelegramMessage,
} from '../server/services/telegramMessageOutboxService.ts';

const successResponse = () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
const failureResponse = (status = 500, description = 'temporary Telegram failure') => new Response(
  JSON.stringify({ ok: false, description }),
  { status, headers: { 'Content-Type': 'application/json' } },
);

describe('durable Telegram notification outbox', () => {
  let db: DatabaseWrapper;
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;

  beforeEach(async () => {
    db = createDatabaseConnection(':memory:');
    await createApp(db);
    process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  });

  afterEach(() => {
    if (previousToken == null) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousToken;
    try { db.sqlite.close(); } catch {}
  });

  it('records partial failure and retries the failed recipient without duplicating the sent recipient', async () => {
    await enqueueTelegramMessage(db, {
      messageKey: 'betting-open:pool:one', category: 'betting', eventType: 'betting_pool_opened', entityId: 'pool',
      playerId: 'one', chatId: '101', text: 'one',
    });
    await enqueueTelegramMessage(db, {
      messageKey: 'betting-open:pool:two', category: 'betting', eventType: 'betting_pool_opened', entityId: 'pool',
      playerId: 'two', chatId: '202', text: 'two',
    });

    const calls: string[] = [];
    const partialFetch = (async (_url: any, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      calls.push(String(body.chat_id));
      return String(body.chat_id) === '101' ? successResponse() : failureResponse();
    }) as typeof fetch;
    const partial = await drainTelegramMessageOutbox(db, { fetchImpl: partialFetch, concurrency: 2 });
    expect(partial).toMatchObject({ processed: 2, sent: 1, failed: 1 });
    expect(calls.sort()).toEqual(['101', '202']);

    const rows = await db.all<any>('SELECT * FROM telegram_message_outbox ORDER BY chat_id');
    expect(rows.find((row) => row.chat_id === '101')?.status).toBe('sent');
    expect(rows.find((row) => row.chat_id === '202')?.status).toBe('failed');
    expect(Number(rows.find((row) => row.chat_id === '202')?.retry_count)).toBe(1);
    expect(rows.find((row) => row.chat_id === '202')?.last_error).toContain('temporary Telegram failure');

    await db.run("UPDATE telegram_message_outbox SET next_attempt_at = datetime('now', '-1 minute') WHERE chat_id = '202'");
    const retryCalls: string[] = [];
    const retry = await drainTelegramMessageOutbox(db, {
      fetchImpl: (async (_url: any, init?: RequestInit) => {
        retryCalls.push(String(JSON.parse(String(init?.body || '{}')).chat_id));
        return successResponse();
      }) as typeof fetch,
      concurrency: 2,
    });
    expect(retry).toMatchObject({ processed: 1, sent: 1, failed: 0 });
    expect(retryCalls).toEqual(['202']);
    const retried = await db.get<any>("SELECT * FROM telegram_message_outbox WHERE chat_id = '202'");
    expect(retried?.status).toBe('sent');
    expect(Number(retried?.retry_count)).toBe(1);
    expect(retried?.sent_at).toBeTruthy();
  });

  it('deduplicates repeated notification events and never resends an already-sent key', async () => {
    const input = {
      messageKey: 'personal:event:stable', category: 'personal' as const, eventType: 'event', entityId: 'e1',
      playerId: 'p1', chatId: '303', text: 'first',
    };
    await enqueueTelegramMessage(db, input);
    await enqueueTelegramMessage(db, { ...input, text: 'updated payload before delivery' });
    expect(Number((await db.get<any>("SELECT COUNT(*) AS count FROM telegram_message_outbox WHERE message_key='personal:event:stable'"))?.count)).toBe(1);

    let sends = 0;
    const fetchImpl = (async () => { sends += 1; return successResponse(); }) as typeof fetch;
    await drainTelegramMessageOutbox(db, { fetchImpl });
    await enqueueTelegramMessage(db, { ...input, text: 'same event again' });
    await drainTelegramMessageOutbox(db, { fetchImpl });
    expect(sends).toBe(1);
    const row = await db.get<any>("SELECT * FROM telegram_message_outbox WHERE message_key='personal:event:stable'");
    expect(row?.status).toBe('sent');
  });
});

describe('personal and organizer Telegram notifications', () => {
  let db: DatabaseWrapper;
  let app: any;
  let organizerCookie: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const key of ['TELEGRAM_BOT_TOKEN', 'ORGANIZER_NOTIFICATION_IDS', 'ORGANIZER_CHAT_ID', 'ORGANIZER_NOTIFICATION_USE_BACKUP', 'BACKUP_ADMIN_ID', 'ADMIN_IDS']) {
      savedEnv[key] = process.env[key];
    }
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.ORGANIZER_NOTIFICATION_IDS;
    delete process.env.ORGANIZER_CHAT_ID;
    delete process.env.ORGANIZER_NOTIFICATION_USE_BACKUP;
    process.env.BACKUP_ADMIN_ID = '999';
    process.env.ADMIN_IDS = '111,222,333';
    db = createDatabaseConnection(':memory:');
    app = await createApp(db);
    organizerCookie = `organizer_token=${generateOrganizerToken()}`;
  });

  afterEach(async () => {
    // Let any fire-and-forget outbox drain finish before closing the in-memory DB.
    await new Promise<void>((resolve) => { setTimeout(resolve, 10); });
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value == null) delete process.env[key]; else process.env[key] = value;
    }
    try { db.sqlite.close(); } catch {}
  });

  it('creates personal invitation delivery without opening Player Cabinet and deduplicates reconciliation', async () => {
    const now = new Date();
    const starts = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    const stamp = now.toISOString();
    await db.run(
      `INSERT INTO players (id,nickname,telegram_user_id,contact_status,lifecycle_status,judge_level,elo,tokens,created_at,updated_at)
       VALUES ('personal-player','Personal player','555001','normal','normal','none',1000,0,?,?)`,
      [stamp, stamp],
    );
    await db.run(
      `INSERT INTO game_evenings (id,title,starts_at,timezone,format,status,capacity,default_price,created_at,updated_at)
       VALUES ('personal-evening','Сегодня игра',?,'Europe/Moscow','CASUAL','published',20,400,?,?)`,
      [starts, stamp, stamp],
    );
    await db.run(
      `INSERT INTO evening_participants
       (id,evening_id,player_id,source,registration_status,response_status,attendance_status,payment_status,created_at,updated_at)
       VALUES ('personal-participant','personal-evening','personal-player','invite','unanswered','unanswered','unknown','unpaid',?,?)`,
      [stamp, stamp],
    );

    await reconcilePersonalTelegramNotifications(db);
    await reconcilePersonalTelegramNotifications(db);
    const rows = await db.all<any>("SELECT * FROM telegram_message_outbox WHERE player_id='personal-player' AND event_type='invitation'");
    expect(rows).toHaveLength(1);
    expect(rows[0].chat_id).toBe('555001');
  });

  it('does not silently use ADMIN_IDS or BACKUP_ADMIN_ID and queues an explicit organizer test', async () => {
    expect(resolveOrganizerNotificationRecipients(process.env)).toMatchObject({ recipients: [], source: 'none', fallback: false });

    process.env.ORGANIZER_NOTIFICATION_IDS = '7001,7002';
    expect(resolveOrganizerNotificationRecipients(process.env)).toMatchObject({ recipients: ['7001', '7002'], source: 'ORGANIZER_NOTIFICATION_IDS' });

    const response = await request(app)
      .post('/api/telegram-settings/actions/test-notification')
      .set('Cookie', organizerCookie);
    expect(response.status).toBe(202);
    expect(response.body.queued).toBe(2);
    const queued = await db.all<any>("SELECT chat_id,status FROM telegram_message_outbox WHERE category='organizer' AND event_type='test_notification' ORDER BY chat_id");
    expect(queued.map((row) => row.chat_id)).toEqual(['7001', '7002']);

    const settings = await request(app).get('/api/telegram-settings').set('Cookie', organizerCookie);
    expect(settings.status).toBe(200);
    expect(settings.body.organizer_notifications.configured_recipient_count).toBe(2);
    expect(settings.body.runtime_monitor.separately_configured).toBe(true);
  });
});
