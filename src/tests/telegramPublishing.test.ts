import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import { ensureTelegramPublishingSchema } from '../db/ensureTelegramPublishingSchema.ts';
import { drainTelegramSyncOutbox } from '../server/services/telegramSyncOutboxService.ts';

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

describe('Telegram publishing destinations', () => {
  it('seeds the four club destinations disabled by default', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);

    const rows = await db.all<any>('SELECT id, active FROM telegram_destinations ORDER BY id ASC');
    expect(rows.map((row) => row.id).sort()).toEqual(['club', 'novice', 'public', 'rating']);
    expect(rows.every((row) => Number(row.active) === 0)).toBe(true);
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

  it('does not recreate a deleted evening job through participant cascade', async () => {
    db = createDatabaseConnection(':memory:');
    await ensureTelegramPublishingSchema(db);
    await insertEvening(db, 'ev-delete-roster');
    await insertPlayer(db, 'player-delete-roster');
    await insertParticipant(db, 'participant-delete-roster', 'ev-delete-roster', 'player-delete-roster');
    await db.run('DELETE FROM telegram_sync_outbox');

    await db.run("DELETE FROM game_evenings WHERE id='ev-delete-roster'");
    const jobs = await db.all<any>('SELECT sync_key, kind, entity_id FROM telegram_sync_outbox ORDER BY sync_key');

    expect(jobs).toEqual([
      { sync_key: 'public-router', kind: 'public_router', entity_id: null },
    ]);
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
