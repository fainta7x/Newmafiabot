import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import {
  CRM_PAY_003_HISTORICAL_MIGRATION,
  CRM_PAY_003_R2_HISTORICAL_MIGRATION,
  reconcileHistoricalRegularEveningsR2Once,
} from '../db/ensureClubOperationsSchema';
import { createDatabaseConnection, type DatabaseWrapper } from '../db/index';

const now = '2026-09-09T13:00:00.000Z';

async function markV1Completed(db: DatabaseWrapper) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS application_migration_history (
      migration_key TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      total_count INTEGER NOT NULL DEFAULT 0,
      processed_count INTEGER NOT NULL DEFAULT 0,
      last_evening_id TEXT,
      failed_evening_id TEXT,
      error_message TEXT,
      updated_at TEXT NOT NULL
    )
  `);
  await db.run(`
    INSERT INTO application_migration_history
      (migration_key,status,started_at,completed_at,total_count,processed_count,updated_at)
    VALUES (?, 'completed', ?, ?, 1, 1, ?)
  `, [CRM_PAY_003_HISTORICAL_MIGRATION, now, now, now]);
}

async function seedLegacyWaiver(db: DatabaseWrapper, input: {
  suffix: string;
  notes?: string | null;
  clubRole?: 'guest' | 'member' | 'team' | 'organizer';
  judgeLevel?: 'none' | 'trainee' | 'host' | 'judge';
  paid?: number;
}) {
  const eveningId = `legacy-waiver-evening-${input.suffix}`;
  const playerId = `legacy-waiver-player-${input.suffix}`;
  const participantId = `legacy-waiver-participant-${input.suffix}`;

  await db.run(
    `INSERT INTO game_evenings
      (id,title,starts_at,timezone,format,status,capacity,default_price,settled_at,created_at,updated_at)
     VALUES (?,?,'2026-08-07T20:00:00+03:00','Europe/Moscow','CASUAL','completed',20,600,?,?,?)`,
    [eveningId, `Legacy waiver ${input.suffix}`, now, now, now],
  );
  await db.run(
    `INSERT INTO players
      (id,nickname,lifecycle_status,source,elo,tokens,club_role,judge_level,created_at,updated_at)
     VALUES (?,?,'normal','test',1000,0,?,?,?,?)`,
    [playerId, `Legacy Player ${input.suffix}`, input.clubRole ?? 'member', input.judgeLevel ?? 'none', now, now],
  );
  await db.run(
    `INSERT INTO evening_participants
      (id,evening_id,player_id,response_status,registration_status,attendance_status,arrival_status,payment_status,amount_due,amount_paid,notes,created_at,updated_at)
     VALUES (?,?,?,'going','going','attended','on_time','waived',0,?,?,?,?)`,
    [participantId, eveningId, playerId, input.paid ?? 0, input.notes ?? null, now, now],
  );
  const protocol = JSON.stringify({
    version: 1,
    kind: 'club_evening_protocol',
    protocol: { status: 'completed' },
    player_results: [{ participant_id: participantId }],
  });
  await db.run(
    `INSERT INTO games
      (evening_id,global_game_number,game_date,winner_team,winner_label,protocol_text,slots_json,created_at)
     VALUES (?,1,'2026-08-07','red','Красные',?,'[]',?)`,
    [eveningId, protocol, now],
  );

  return { eveningId, playerId, participantId };
}

describe('CRM-PAY-003-R2 safe legacy waiver migration', () => {
  const openDbs: DatabaseWrapper[] = [];
  const makeDb = () => {
    const db = createDatabaseConnection(':memory:');
    // Recreate the historical schema shape that existed before R2 fee-evidence tables:
    // global role/judge columns were already present and are necessary to distinguish
    // an explicit waiver from the old global organizer/judge exemption behavior.
    const playerColumns = db.sqlite.pragma('table_info(players)') as Array<{ name: string }>;
    if (!playerColumns.some((column) => column.name === 'club_role')) {
      db.sqlite.exec("ALTER TABLE players ADD COLUMN club_role TEXT NOT NULL DEFAULT 'member'");
    }
    if (!playerColumns.some((column) => column.name === 'judge_level')) {
      db.sqlite.exec("ALTER TABLE players ADD COLUMN judge_level TEXT NOT NULL DEFAULT 'none'");
    }
    openDbs.push(db);
    return db;
  };

  afterEach(() => {
    while (openDbs.length) {
      const db = openDbs.pop()!;
      try { db.sqlite.close(); } catch {}
    }
  });

  it('migrates a reliably identifiable legitimate legacy waiver before R2 reconciliation', async () => {
    const db = makeDb();
    await markV1Completed(db);
    const ids = await seedLegacyWaiver(db, {
      suffix: 'explicit',
      notes: 'Бесплатный вечер — явное освобождение организатором',
    });

    await createApp(db);

    const waiver = await db.get<any>('SELECT reason FROM evening_fee_waivers WHERE participant_id = ?', [ids.participantId]);
    expect(String(waiver?.reason || '')).toContain('Migrated legacy explicit waiver');
    const participant = await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id = ?', [ids.participantId]);
    expect(participant).toMatchObject({ amount_due: 0, payment_status: 'waived' });
    const diagnostic = await db.get<any>('SELECT participant_id FROM evening_fee_waiver_migration_diagnostics WHERE participant_id = ?', [ids.participantId]);
    expect(diagnostic).toBeNull();
  });

  it('holds an ambiguous historical waiver at zero debt and persists durable review diagnostics', async () => {
    const db = makeDb();
    await markV1Completed(db);
    const ids = await seedLegacyWaiver(db, {
      suffix: 'ambiguous',
      clubRole: 'organizer',
      notes: null,
    });

    await createApp(db);

    const waiver = await db.get<any>('SELECT participant_id FROM evening_fee_waivers WHERE participant_id = ?', [ids.participantId]);
    expect(waiver).toBeNull();
    const diagnostic = await db.get<any>(
      'SELECT status,reason FROM evening_fee_waiver_migration_diagnostics WHERE participant_id = ?',
      [ids.participantId],
    );
    expect(diagnostic?.status).toBe('needs_review');
    expect(String(diagnostic?.reason || '')).toContain('organizer/judge');
    const participant = await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id = ?', [ids.participantId]);
    expect(participant).toMatchObject({ amount_due: 0, payment_status: 'waived' });
  });

  it('keeps an already migrated explicit waiver idempotently', async () => {
    const db = makeDb();
    await markV1Completed(db);
    const ids = await seedLegacyWaiver(db, { suffix: 'already', notes: null });
    await db.run(`
      CREATE TABLE evening_fee_waivers (
        participant_id TEXT PRIMARY KEY REFERENCES evening_participants(id) ON DELETE CASCADE,
        evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
        reason TEXT,
        waived_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    await db.run(
      `INSERT INTO evening_fee_waivers (participant_id,evening_id,reason,waived_at,updated_at)
       VALUES (?,?,?,?,?)`,
      [ids.participantId, ids.eveningId, 'Already migrated factual waiver', now, now],
    );

    await createApp(db);

    const rows = await db.all<any>('SELECT reason FROM evening_fee_waivers WHERE participant_id = ?', [ids.participantId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe('Already migrated factual waiver');
    const diagnostic = await db.get<any>('SELECT participant_id FROM evening_fee_waiver_migration_diagnostics WHERE participant_id = ?', [ids.participantId]);
    expect(diagnostic).toBeNull();
  });

  it('is idempotent on repeated startup/reconciliation attempts after the R2 marker completes', async () => {
    const db = makeDb();
    await markV1Completed(db);
    const ids = await seedLegacyWaiver(db, { suffix: 'repeat', notes: null });

    await createApp(db);
    await reconcileHistoricalRegularEveningsR2Once(db);
    await reconcileHistoricalRegularEveningsR2Once(db);

    const diagnostics = await db.all<any>('SELECT * FROM evening_fee_waiver_migration_diagnostics WHERE participant_id = ?', [ids.participantId]);
    expect(diagnostics).toHaveLength(1);
    const marker = await db.get<any>('SELECT status,total_count,processed_count FROM application_migration_history WHERE migration_key = ?', [CRM_PAY_003_R2_HISTORICAL_MIGRATION]);
    expect(marker?.status).toBe('completed');
    expect(Number(marker?.processed_count)).toBe(Number(marker?.total_count));
    const participant = await db.get<any>('SELECT amount_due,payment_status FROM evening_participants WHERE id = ?', [ids.participantId]);
    expect(participant).toMatchObject({ amount_due: 0, payment_status: 'waived' });
  });

  it('resumes a durable failed R2 marker instead of rescanning from scratch or blocking startup', async () => {
    const db = makeDb();
    await markV1Completed(db);
    const ids = await seedLegacyWaiver(db, { suffix: 'resume', notes: null });

    await createApp(db);
    await db.run(`
      UPDATE application_migration_history
         SET status = 'failed', completed_at = NULL, processed_count = 0,
             last_evening_id = NULL, failed_evening_id = ?, error_message = 'forced interruption', updated_at = ?
       WHERE migration_key = ?
    `, [ids.eveningId, now, CRM_PAY_003_R2_HISTORICAL_MIGRATION]);

    await reconcileHistoricalRegularEveningsR2Once(db);

    const marker = await db.get<any>(
      'SELECT status,total_count,processed_count,failed_evening_id,error_message FROM application_migration_history WHERE migration_key = ?',
      [CRM_PAY_003_R2_HISTORICAL_MIGRATION],
    );
    expect(marker?.status).toBe('completed');
    expect(Number(marker?.processed_count)).toBe(Number(marker?.total_count));
    expect(marker?.failed_evening_id).toBeNull();
    expect(marker?.error_message).toBeNull();
  });

  it('preserves recorded payment while migrating a legacy waiver and never creates negative income/refunds', async () => {
    const db = makeDb();
    await markV1Completed(db);
    const ids = await seedLegacyWaiver(db, {
      suffix: 'paid',
      notes: 'Explicit free waiver approved by organizer',
      paid: 150,
    });

    await createApp(db);

    const participant = await db.get<any>('SELECT amount_due,amount_paid,payment_status FROM evening_participants WHERE id = ?', [ids.participantId]);
    expect(participant).toMatchObject({ amount_due: 0, amount_paid: 150, payment_status: 'paid' });
    const badIncome = await db.get<any>(
      `SELECT COUNT(*) AS count FROM financial_transactions
        WHERE evening_id = ? AND type = 'income' AND amount < 0`,
      [ids.eveningId],
    );
    expect(Number(badIncome?.count || 0)).toBe(0);
    const refunds = await db.get<any>(
      `SELECT COUNT(*) AS count FROM financial_transactions
        WHERE evening_id = ? AND type = 'refund'`,
      [ids.eveningId],
    );
    expect(Number(refunds?.count || 0)).toBe(0);
  });
});