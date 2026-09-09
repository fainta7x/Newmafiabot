import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index.ts';
import {
  CRM_PAY_003_HISTORICAL_MIGRATION,
  reconcileHistoricalRegularEveningsOnce,
} from '../db/ensureClubOperationsSchema.ts';

const now = '2026-09-09T12:00:00.000Z';

async function seedHistoricalCasual(db: DatabaseWrapper) {
  await db.run(
    `INSERT INTO players (id, nickname, lifecycle_status, created_at, updated_at)
     VALUES ('p1', 'Игрок', 'normal', ?, ?)`,
    [now, now],
  );
  await db.run(
    `INSERT INTO game_evenings (
       id, title, starts_at, format, status, settled_at, default_price, created_at, updated_at
     ) VALUES ('e1', 'Исторический вечер', ?, 'CASUAL', 'completed', ?, 600, ?, ?)`,
    [now, now, now, now],
  );
  await db.run(
    `INSERT INTO evening_participants (
       id, evening_id, player_id, response_status, registration_status,
       attendance_status, arrival_status, payment_status, amount_due, amount_paid,
       created_at, updated_at
     ) VALUES (
       'ep1', 'e1', 'p1', 'going', 'going', 'attended', 'on_time', 'paid', 600, 600, ?, ?
     )`,
    [now, now],
  );
  await db.run(
    `INSERT INTO games (
       evening_id, global_game_number, game_date, winner_team, winner_label,
       protocol_text, slots_json, created_at
     ) VALUES ('e1', 1, ?, 'red', 'Красные', ?, '[]', ?)`,
    [
      now,
      JSON.stringify({
        version: 1,
        kind: 'club_evening_protocol',
        protocol: { status: 'completed' },
        player_results: [{ participant_id: 'ep1' }],
      }),
      now,
    ],
  );
}

describe('CRM-PAY-003 durable historical reconciliation migration', () => {
  let db: DatabaseWrapper;

  beforeEach(() => { db = createDatabaseConnection(':memory:'); });
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('marks the historical scan completed and skips it on the next startup-style call', async () => {
    await seedHistoricalCasual(db);

    await reconcileHistoricalRegularEveningsOnce(db);

    expect(await db.get<any>(
      'SELECT status, total_count, processed_count, last_evening_id, failed_evening_id, error_message FROM application_migration_history WHERE migration_key = ?',
      [CRM_PAY_003_HISTORICAL_MIGRATION],
    )).toMatchObject({
      status: 'completed',
      total_count: 1,
      processed_count: 1,
      last_evening_id: 'e1',
      failed_evening_id: null,
      error_message: null,
    });
    expect(await db.get<any>('SELECT amount_due, amount_paid, payment_status FROM evening_participants WHERE id = ?', ['ep1']))
      .toMatchObject({ amount_due: 100, amount_paid: 600, payment_status: 'paid' });

    const ledgerBefore = await db.all<any>(
      "SELECT type, amount, source_type, source_id FROM financial_transactions WHERE source_type = 'evening_pricing_reconcile' ORDER BY type",
    );
    await db.run('DROP TABLE games');

    // A completed marker must return before touching historical game data again.
    await expect(reconcileHistoricalRegularEveningsOnce(db)).resolves.toBeUndefined();
    const ledgerAfter = await db.all<any>(
      "SELECT type, amount, source_type, source_id FROM financial_transactions WHERE source_type = 'evening_pricing_reconcile' ORDER BY type",
    );
    expect(ledgerAfter).toEqual(ledgerBefore);
  });

  it('records a failed evening durably and blocks repeated full rescans with diagnostics', async () => {
    await seedHistoricalCasual(db);
    await db.run('DROP TABLE games');

    await expect(reconcileHistoricalRegularEveningsOnce(db))
      .rejects.toThrow(/durable diagnostics were recorded/i);

    const marker = await db.get<any>(
      'SELECT status, total_count, processed_count, last_evening_id, failed_evening_id, error_message FROM application_migration_history WHERE migration_key = ?',
      [CRM_PAY_003_HISTORICAL_MIGRATION],
    );
    expect(marker.status).toBe('failed');
    expect(marker.total_count).toBe(1);
    expect(marker.processed_count).toBe(0);
    expect(marker.last_evening_id).toBeNull();
    expect(marker.failed_evening_id).toBe('e1');
    expect(String(marker.error_message)).toMatch(/games/i);

    await expect(reconcileHistoricalRegularEveningsOnce(db))
      .rejects.toThrow(/Full rescan is intentionally blocked/i);
  });
});
