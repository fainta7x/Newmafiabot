import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import {
  CRM_PAY_003_HISTORICAL_MIGRATION,
  CRM_PAY_003_R2_HISTORICAL_MIGRATION,
  CRM_PAY_003_STALE_DEBT_REPAIR_MIGRATION,
} from '../db/ensureClubOperationsSchema';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';

const now = '2026-09-09T20:00:00.000Z';

describe('CRM stale historical debt repair', () => {
  let db: DatabaseWrapper;
  afterEach(() => { try { db.sqlite.close(); } catch {} });

  it('reconciles legacy 600 ₽ debt even when both older migration markers are completed', async () => {
    db = createDatabaseConnection(':memory:');
    await db.run(`INSERT INTO players (id,nickname,lifecycle_status,created_at,updated_at)
      VALUES ('p1','Millourt','normal',?,?)`, [now, now]);
    await db.run(`INSERT INTO game_evenings
      (id,title,starts_at,format,status,settled_at,default_price,created_at,updated_at)
      VALUES ('e1','4 сентября',?,'CASUAL','completed',?,600,?,?)`, [now, now, now, now]);
    await db.run(`INSERT INTO evening_participants
      (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('ep1','e1','p1','going','going','attended','on_time','unpaid',600,0,?,?)`, [now, now]);
    await db.run(`INSERT INTO games
      (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
      VALUES ('e1',1,'2026-09-04','red','Красные',?,'[]',?)`, [JSON.stringify({
        version: 1,
        kind: 'club_evening_protocol',
        protocol: { status: 'completed' },
        player_results: [{ participant_id: 'ep1' }],
      }), now]);
    await db.run(`CREATE TABLE IF NOT EXISTS application_migration_history (
      migration_key TEXT PRIMARY KEY,status TEXT NOT NULL,started_at TEXT,total_count INTEGER NOT NULL DEFAULT 0,
      processed_count INTEGER NOT NULL DEFAULT 0,last_evening_id TEXT,failed_evening_id TEXT,error_message TEXT,
      completed_at TEXT,updated_at TEXT NOT NULL)`);
    for (const key of [CRM_PAY_003_HISTORICAL_MIGRATION, CRM_PAY_003_R2_HISTORICAL_MIGRATION]) {
      await db.run(`INSERT INTO application_migration_history
        (migration_key,status,total_count,processed_count,completed_at,updated_at)
        VALUES (?,'completed',1,1,?,?)`, [key, now, now]);
    }

    await createApp(db);

    expect(await db.get<any>('SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id=?', ['ep1']))
      .toMatchObject({ amount_due: 100, amount_paid: 0, payment_status: 'unpaid' });
    expect(await db.get<any>('SELECT status,processed_count FROM application_migration_history WHERE migration_key=?', [CRM_PAY_003_STALE_DEBT_REPAIR_MIGRATION]))
      .toMatchObject({ status: 'completed', processed_count: 1 });
  });

  it('audits a closed evening even when every one-time CRM-PAY marker was already completed', async () => {
    db = createDatabaseConnection(':memory:');
    await db.run(`INSERT INTO players (id,nickname,lifecycle_status,created_at,updated_at)
      VALUES ('p2','Aloё','normal',?,?)`, [now, now]);
    await db.run(`INSERT INTO game_evenings
      (id,title,starts_at,format,status,settled_at,default_price,created_at,updated_at)
      VALUES ('e2','4 сентября',?,'CASUAL','completed',?,600,?,?)`, [now, now, now, now]);
    await db.run(`INSERT INTO evening_participants
      (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,created_at,updated_at)
      VALUES ('ep2','e2','p2','going','going','attended','on_time','unpaid',600,0,?,?)`, [now, now]);
    await db.run(`INSERT INTO games
      (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
      VALUES ('e2',1,'2026-09-04','red','Красные',?,'[]',?)`, [JSON.stringify({
        version: 1,
        kind: 'club_evening_protocol',
        protocol: { status: 'completed' },
        player_results: [{ participant_id: 'ep2' }],
      }), now]);
    await db.run(`CREATE TABLE IF NOT EXISTS application_migration_history (
      migration_key TEXT PRIMARY KEY,status TEXT NOT NULL,started_at TEXT,total_count INTEGER NOT NULL DEFAULT 0,
      processed_count INTEGER NOT NULL DEFAULT 0,last_evening_id TEXT,failed_evening_id TEXT,error_message TEXT,
      completed_at TEXT,updated_at TEXT NOT NULL)`);
    for (const key of [
      CRM_PAY_003_HISTORICAL_MIGRATION,
      CRM_PAY_003_R2_HISTORICAL_MIGRATION,
      CRM_PAY_003_STALE_DEBT_REPAIR_MIGRATION,
    ]) {
      await db.run(`INSERT INTO application_migration_history
        (migration_key,status,total_count,processed_count,completed_at,updated_at)
        VALUES (?,'completed',1,1,?,?)`, [key, now, now]);
    }

    await createApp(db);

    expect(await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id=?', ['ep2']))
      .toMatchObject({ amount_due: 100, payment_status: 'unpaid' });
    expect(await db.get<any>(
      'SELECT pricing_revision FROM regular_evening_payment_integrity_checks WHERE evening_id=?', ['e2'],
    )).toMatchObject({ pricing_revision: 'casual_factual_price_v1' });
  });
});
