import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import {
  beginReminderCampaign,
  recordInitialAnnouncementAttempt,
  recordReminderAttempt,
} from '../server/services/eveningAnnouncementTrackingService.ts';
import {
  drainTelegramSyncOutbox,
  enqueueTelegramAnnouncement,
  enqueueTelegramReminder,
  enqueueTelegramTournamentSync,
  getTelegramSyncOutboxSummary,
} from '../server/services/telegramSyncOutboxService.ts';

let db: DatabaseWrapper | null = null;

afterEach(() => {
  try { db?.sqlite.close(); } catch {}
  db = null;
});

async function insertEvening(target: DatabaseWrapper, id: string, status = 'published') {
  const now = new Date().toISOString();
  await target.run(
    `INSERT INTO game_evenings (id, title, starts_at, timezone, venue, format, status, capacity, default_price, created_at, updated_at)
     VALUES (?, 'Тест', ?, 'Europe/Moscow', 'Тула', 'CASUAL', ?, 20, 400, ?, ?)`,
    [id, now, status, now, now],
  );
}

async function insertPlayer(target: DatabaseWrapper, id: string) {
  const now = new Date().toISOString();
  await target.run(
    `INSERT INTO players (id, nickname, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    [id, `Игрок ${id}`, now, now],
  );
}

async function insertParticipant(target: DatabaseWrapper, id: string, eveningId: string, playerId: string) {
  const now = new Date().toISOString();
  await target.run(
    `INSERT INTO evening_participants (id, evening_id, player_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, eveningId, playerId, now, now],
  );
}

async function insertTournament(target: DatabaseWrapper, id: string, status = 'draft') {
  const now = new Date().toISOString();
  await target.run(
    `INSERT INTO tournaments (id, title, date, status, created_at, updated_at)
     VALUES (?, 'Турнир', ?, ?, ?, ?)`,
    [id, now, status, now, now],
  );
}

describe('Telegram publishing destinations', () => {
  it('seeds all Telegram destinations and bootstraps only the legacy club route by default', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);

    const rows = await db.all<any>('SELECT id, chat_id, topic_id, active FROM telegram_destinations ORDER BY id ASC');
    expect(rows.map((row) => row.id).sort()).toEqual(['club', 'novice', 'public', 'rating']);
    const club = rows.find((row) => row.id === 'club');
    expect(club).toMatchObject({ chat_id: '-1001628595679', topic_id: 5912, active: 1 });
    expect(rows.filter((row) => row.id !== 'club').every((row) => Number(row.active) === 0)).toBe(true);
  });

  it('falls back to the Python bot club chat/topic defaults when env is absent', async () => {
    const keys = ['TELEGRAM_CLUB_CHAT_ID', 'TEST_GROUP_ID', 'TELEGRAM_CLUB_TOPIC_ID', 'ANNOUNCE_TOPIC_ID'] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    try {
      db = createDatabaseConnection(':memory:');
      await ensureTelegramPublishingSchema(db);

      const club = await db.get<any>("SELECT chat_id, topic_id, active FROM telegram_destinations WHERE id='club'");
      expect(club).toMatchObject({ chat_id: '-1001628595679', topic_id: 5912, active: 1 });
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('rehydrates the club destination from legacy env after a database reset and queues existing open evenings', async () => {
    const previousGroupId = process.env.TEST_GROUP_ID;
    const previousTopicId = process.env.ANNOUNCE_TOPIC_ID;
    process.env.TEST_GROUP_ID = '-1001234567890';
    process.env.ANNOUNCE_TOPIC_ID = '5912';
    try {
      db = createDatabaseConnection(':memory:');
      await insertEvening(db, 'ev-restored-before-schema');
      await ensureTelegramPublishingSchema(db);

      const club = await db.get<any>("SELECT chat_id, topic_id, active FROM telegram_destinations WHERE id='club'");
      expect(club).toMatchObject({ chat_id: '-1001234567890', topic_id: 5912, active: 1 });

      const queued = await db.get<any>("SELECT kind, entity_id FROM telegram_sync_outbox WHERE sync_key='evening:ev-restored-before-schema'");
      expect(queued).toMatchObject({ kind: 'evening', entity_id: 'ev-restored-before-schema' });
    } finally {
      if (previousGroupId === undefined) delete process.env.TEST_GROUP_ID;
      else process.env.TEST_GROUP_ID = previousGroupId;
      if (previousTopicId === undefined) delete process.env.ANNOUNCE_TOPIC_ID;
      else process.env.ANNOUNCE_TOPIC_ID = previousTopicId;
    }
  });

  it('keeps publication identity unique per event and destination', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    const now = new Date().toISOString();
    await insertEvening(db, 'ev-test');
    await db.run(
      `INSERT INTO evening_telegram_publications
        (evening_id, destination_id, chat_id, topic_id, message_id, sent_at, updated_at)
       VALUES ('ev-test', 'club', '-1001', 42, 100, ?, ?)`,
      [now, now],
    );

    await expect(db.run(
      `INSERT INTO evening_telegram_publications
        (evening_id, destination_id, chat_id, topic_id, message_id, sent_at, updated_at)
       VALUES ('ev-test', 'club', '-1001', 42, 101, ?, ?)`,
      [now, now],
    )).rejects.toThrow();
  });

  it('coalesces evening mutations and retries a failed Telegram sync', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    await insertEvening(db, 'ev-sync');

    const first = await db.get<any>("SELECT * FROM telegram_sync_outbox WHERE sync_key='evening:ev-sync'");
    expect(first?.kind).toBe('evening');
    expect(Number(first?.version)).toBe(1);

    await db.run("UPDATE game_evenings SET title='Тест 2', updated_at=? WHERE id='ev-sync'", [new Date().toISOString()]);
    const coalesced = await db.all<any>("SELECT * FROM telegram_sync_outbox WHERE sync_key='evening:ev-sync'");
    expect(coalesced).toHaveLength(1);
    expect(Number(coalesced[0].version)).toBe(2);

    const failed = await drainTelegramSyncOutbox(db, {
      now: new Date('2030-01-01T12:00:00.000Z'),
      deliver: async () => ({ success: false, status: 502, error: 'bot offline' }),
    });
    expect(failed).toMatchObject({ processed: 1, succeeded: 0, failed: 1 });

    const retry = await db.get<any>("SELECT * FROM telegram_sync_outbox WHERE sync_key='evening:ev-sync'");
    expect(Number(retry?.attempt_count)).toBe(1);
    expect(retry?.last_error).toBe('bot offline');
    expect(retry?.next_attempt_at).toBeTruthy();

    await db.run("UPDATE game_evenings SET venue='Суп с Котом', updated_at=? WHERE id='ev-sync'", [new Date().toISOString()]);
    const reset = await db.get<any>("SELECT * FROM telegram_sync_outbox WHERE sync_key='evening:ev-sync'");
    expect(Number(reset?.attempt_count)).toBe(0);
    expect(reset?.next_attempt_at).toBeNull();
    expect(reset?.last_error).toBeNull();

    const succeeded = await drainTelegramSyncOutbox(db, {
      now: new Date('2030-01-01T12:01:00.000Z'),
      deliver: async () => ({ success: true, status: 200, data: { ok: true } }),
    });
    expect(succeeded).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });
    expect(await db.get("SELECT sync_key FROM telegram_sync_outbox WHERE sync_key='evening:ev-sync'")).toBeNull();
  });

  it('coalesces participant RSVP and roster mutations into the evening sync job', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    await insertEvening(db, 'ev-roster');
    await insertPlayer(db, 'player-roster');
    await db.run("DELETE FROM telegram_sync_outbox WHERE sync_key='evening:ev-roster'");

    await insertParticipant(db, 'participant-roster', 'ev-roster', 'player-roster');
    const inserted = await db.get<any>("SELECT * FROM telegram_sync_outbox WHERE sync_key='evening:ev-roster'");
    expect(Number(inserted?.version)).toBe(1);

    await db.run(
      `UPDATE evening_participants
          SET response_status='going', registration_status='confirmed', updated_at=?
        WHERE id='participant-roster'`,
      [new Date().toISOString()],
    );
    const responded = await db.get<any>("SELECT * FROM telegram_sync_outbox WHERE sync_key='evening:ev-roster'");
    expect(Number(responded?.version)).toBe(2);

    await db.run(
      `UPDATE evening_participants
          SET amount_paid=400, payment_status='paid', updated_at=?
        WHERE id='participant-roster'`,
      [new Date().toISOString()],
    );
    const paymentOnly = await db.get<any>("SELECT * FROM telegram_sync_outbox WHERE sync_key='evening:ev-roster'");
    expect(Number(paymentOnly?.version)).toBe(2);

    await db.run("DELETE FROM evening_participants WHERE id='participant-roster'");
    const removed = await db.all<any>("SELECT * FROM telegram_sync_outbox WHERE sync_key='evening:ev-roster'");
    expect(removed).toHaveLength(1);
    expect(Number(removed[0].version)).toBe(3);
  });

  it('queues live tournament mutations without auto-publishing an untouched draft', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    await insertTournament(db, 'tour-durable');

    await db.run("UPDATE tournaments SET title='Черновик 2', updated_at=? WHERE id='tour-durable'", [new Date().toISOString()]);
    expect(await db.get("SELECT dispatch_key FROM telegram_dispatch_outbox WHERE dispatch_key='tournament:tour-durable'")).toBeNull();

    await db.run("UPDATE tournaments SET status='active', updated_at=? WHERE id='tour-durable'", [new Date().toISOString()]);
    const queued = await db.get<any>("SELECT * FROM telegram_dispatch_outbox WHERE dispatch_key='tournament:tour-durable'");
    expect(queued?.kind).toBe('tournament');
    expect(Number(queued?.version)).toBe(1);
  });

  it('retries durable tournament and DM dispatch jobs and reports them in queue health', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    await enqueueTelegramTournamentSync(db, 'tour-dispatch');
    await enqueueTelegramAnnouncement(db, 'ev-dispatch');
    await enqueueTelegramReminder(db, 'ev-dispatch');

    const initial = await getTelegramSyncOutboxSummary(db);
    expect(initial.pending).toBe(3);
    expect(initial.retrying).toBe(0);

    const failed = await drainTelegramSyncOutbox(db, {
      limit: 10,
      now: new Date('2030-01-01T12:00:00.000Z'),
      dispatchDeliver: async () => ({ success: false, status: 503, error: 'bot sleeping' }),
    });
    expect(failed).toMatchObject({ processed: 3, succeeded: 0, failed: 3 });

    const retrying = await getTelegramSyncOutboxSummary(db);
    expect(retrying.pending).toBe(3);
    expect(retrying.retrying).toBe(3);
    expect(retrying.lastError).toBe('bot sleeping');
    expect(retrying.nextAttemptAt).toBeTruthy();

    const succeeded = await drainTelegramSyncOutbox(db, {
      limit: 10,
      now: new Date('2030-01-01T12:01:00.000Z'),
      dispatchDeliver: async () => ({ success: true, status: 200 }),
    });
    expect(succeeded).toMatchObject({ processed: 3, succeeded: 3, failed: 0 });
    expect((await getTelegramSyncOutboxSummary(db)).pending).toBe(0);
  });

  it('marks successful reminders with the current campaign generation', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    await insertEvening(db, 'ev-campaign');
    await insertPlayer(db, 'player-campaign');
    await recordInitialAnnouncementAttempt(db, {
      eveningId: 'ev-campaign',
      playerId: 'player-campaign',
      telegramUserId: '123456',
      success: true,
      telegramMessageId: 10,
    });

    const firstCampaign = await beginReminderCampaign(db, 'ev-campaign');
    expect(firstCampaign).toBe(1);
    await recordReminderAttempt(db, {
      eveningId: 'ev-campaign',
      playerId: 'player-campaign',
      telegramUserId: '123456',
      success: true,
      telegramMessageId: 11,
    });
    const tracked = await db.get<any>(
      `SELECT reminder_count, last_reminder_campaign
         FROM evening_announcement_dm_tracking
        WHERE evening_id='ev-campaign' AND player_id='player-campaign'`,
    );
    expect(Number(tracked?.reminder_count)).toBe(1);
    expect(Number(tracked?.last_reminder_campaign)).toBe(1);
    expect(await beginReminderCampaign(db, 'ev-campaign')).toBe(2);
  });

  it('does not recreate a deleted evening job through participant cascade', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    await insertEvening(db, 'ev-delete-roster');
    await insertPlayer(db, 'player-delete-roster');
    await insertParticipant(db, 'participant-delete-roster', 'ev-delete-roster', 'player-delete-roster');
    await enqueueTelegramAnnouncement(db, 'ev-delete-roster');
    await enqueueTelegramReminder(db, 'ev-delete-roster');
    await db.run('DELETE FROM telegram_sync_outbox');

    await db.run("DELETE FROM game_evenings WHERE id='ev-delete-roster'");
    const jobs = await db.all<any>('SELECT sync_key, kind, entity_id FROM telegram_sync_outbox ORDER BY sync_key');
    const dispatchJobs = await db.all<any>('SELECT dispatch_key FROM telegram_dispatch_outbox ORDER BY dispatch_key');

    expect(jobs).toEqual([
      { sync_key: 'public-router', kind: 'public_router', entity_id: null },
    ]);
    expect(dispatchJobs).toEqual([]);
  });

  it('drops a deleted evening job and keeps only the public router refresh', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    await insertEvening(db, 'ev-delete');

    await db.run("DELETE FROM game_evenings WHERE id='ev-delete'");
    const jobs = await db.all<any>('SELECT sync_key, kind, entity_id FROM telegram_sync_outbox ORDER BY sync_key');

    expect(jobs).toEqual([
      { sync_key: 'public-router', kind: 'public_router', entity_id: null },
    ]);
  });
});
