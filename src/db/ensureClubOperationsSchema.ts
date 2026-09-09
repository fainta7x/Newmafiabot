import type { DatabaseWrapper } from './index.ts';
import { normalizeEveningFormat } from '../lib/eveningFormat.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from './ensureOrganizerPlayerAccessSchema.ts';

const ensuredDatabases = new WeakSet<object>();
export const CRM_PAY_003_HISTORICAL_MIGRATION = 'crm_pay_003_historical_casual_pricing_v1';
export const CRM_PAY_003_R2_HISTORICAL_MIGRATION = 'crm_pay_003_r2_evening_specific_fee_exemptions_v1';

async function ensurePlayerAccessColumns(db: DatabaseWrapper) {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(players)');
  if (!columns.some((column) => column.name === 'game_level')) {
    await db.run("ALTER TABLE players ADD COLUMN game_level TEXT NOT NULL DEFAULT 'club'");
  }
  if (!columns.some((column) => column.name === 'club_role')) {
    await db.run("ALTER TABLE players ADD COLUMN club_role TEXT NOT NULL DEFAULT 'member'");
  }
}

async function normalizeRegularEveningDefaults(db: DatabaseWrapper, now: string) {
  const rows = await db.all<any>('SELECT id, format, default_price FROM game_evenings');
  for (const row of rows) {
    if (normalizeEveningFormat(row.format) !== 'CASUAL' || Number(row.default_price || 0) === 100) continue;
    await db.run(
      'UPDATE game_evenings SET default_price = 100, updated_at = ? WHERE id = ?',
      [now, String(row.id)],
    );
  }
}

async function clearRegularPlannedCharges(db: DatabaseWrapper, now: string) {
  const rows = await db.all<any>(`
    SELECT ep.id, ep.amount_due, ep.amount_paid, ep.payment_status, e.format
      FROM evening_participants ep
      JOIN game_evenings e ON e.id = ep.evening_id
     WHERE COALESCE(ep.attendance_status, 'pending') = 'pending'
       AND e.status != 'completed'
       AND e.settled_at IS NULL
  `);
  for (const row of rows) {
    if (normalizeEveningFormat(row.format) !== 'CASUAL') continue;
    const recordedPaid = Math.max(0, Number(row.amount_paid || 0));
    const nextStatus = recordedPaid > 0 ? 'paid' : 'waived';
    if (Number(row.amount_due || 0) === 0 && String(row.payment_status || '') === nextStatus) continue;
    await db.run(
      'UPDATE evening_participants SET amount_due = 0, payment_status = ?, updated_at = ? WHERE id = ?',
      [nextStatus, now, String(row.id)],
    );
  }
}

async function ensureApplicationMigrationHistory(db: DatabaseWrapper) {
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
}

async function ensureEveningFeeEvidenceSchema(db: DatabaseWrapper) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS evening_fee_waivers (
      participant_id TEXT PRIMARY KEY REFERENCES evening_participants(id) ON DELETE CASCADE,
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      reason TEXT,
      waived_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_evening_fee_waivers_evening
      ON evening_fee_waivers(evening_id)
  `);
}

async function reconcileHistoricalRegularEveningsWithMarker(
  db: DatabaseWrapper,
  migrationKey: string,
): Promise<void> {
  await ensureApplicationMigrationHistory(db);

  const existing = await db.get<any>(
    'SELECT * FROM application_migration_history WHERE migration_key = ? LIMIT 1',
    [migrationKey],
  );
  if (existing?.status === 'completed') return;
  if (existing?.status === 'failed' || existing?.status === 'running') {
    const context = [
      `status=${String(existing.status)}`,
      `processed=${Number(existing.processed_count || 0)}/${Number(existing.total_count || 0)}`,
      existing.last_evening_id ? `last=${String(existing.last_evening_id)}` : null,
      existing.failed_evening_id ? `failed=${String(existing.failed_evening_id)}` : null,
      existing.error_message ? `error=${String(existing.error_message)}` : null,
    ].filter(Boolean).join(', ');
    throw new Error(
      `Historical CASUAL pricing migration ${migrationKey} requires investigation (${context}). Full rescan is intentionally blocked.`,
    );
  }

  const rows = await db.all<any>(`
    SELECT id, format
      FROM game_evenings
     WHERE status = 'completed' OR settled_at IS NOT NULL
     ORDER BY starts_at ASC, id ASC
  `);
  const casualIds = rows
    .filter((row) => normalizeEveningFormat(row.format) === 'CASUAL')
    .map((row) => String(row.id));
  const startedAt = new Date().toISOString();

  await db.run(`
    INSERT INTO application_migration_history (
      migration_key, status, started_at, total_count, processed_count, updated_at
    ) VALUES (?, 'running', ?, ?, 0, ?)
  `, [migrationKey, startedAt, casualIds.length, startedAt]);

  const { reconcileRegularEveningPayments } = await import('../server/services/eveningPaymentPricingService.ts');
  let processed = 0;
  let lastEveningId: string | null = null;
  for (const eveningId of casualIds) {
    try {
      await reconcileRegularEveningPayments(db, eveningId);
      processed += 1;
      lastEveningId = eveningId;
      await db.run(`
        UPDATE application_migration_history
           SET processed_count = ?, last_evening_id = ?, updated_at = ?
         WHERE migration_key = ?
      `, [processed, lastEveningId, new Date().toISOString(), migrationKey]);
    } catch (error: any) {
      const message = String(error?.message || error || 'Unknown reconciliation error').slice(0, 2000);
      const failedAt = new Date().toISOString();
      await db.run(`
        UPDATE application_migration_history
           SET status = 'failed', processed_count = ?, last_evening_id = ?,
               failed_evening_id = ?, error_message = ?, updated_at = ?
         WHERE migration_key = ?
      `, [processed, lastEveningId, eveningId, message, failedAt, migrationKey]);
      console.error(
        `[CRM-PAY-003] Historical CASUAL reconciliation ${migrationKey} failed at evening ${eveningId} after ${processed}/${casualIds.length}: ${message}`,
      );
      throw new Error(
        `CRM-PAY-003 historical reconciliation ${migrationKey} failed at evening ${eveningId}; durable diagnostics were recorded and automatic full rescan is blocked. Cause: ${message}`,
      );
    }
  }

  const completedAt = new Date().toISOString();
  await db.run(`
    UPDATE application_migration_history
       SET status = 'completed', processed_count = ?, last_evening_id = ?,
           failed_evening_id = NULL, error_message = NULL, completed_at = ?, updated_at = ?
     WHERE migration_key = ?
  `, [processed, lastEveningId, completedAt, completedAt, migrationKey]);
}

export async function reconcileHistoricalRegularEveningsOnce(db: DatabaseWrapper): Promise<void> {
  return reconcileHistoricalRegularEveningsWithMarker(db, CRM_PAY_003_HISTORICAL_MIGRATION);
}

export async function reconcileHistoricalRegularEveningsR2Once(db: DatabaseWrapper): Promise<void> {
  return reconcileHistoricalRegularEveningsWithMarker(db, CRM_PAY_003_R2_HISTORICAL_MIGRATION);
}

export async function ensureClubOperationsSchema(db: DatabaseWrapper): Promise<void> {
  if (ensuredDatabases.has(db as object)) return;

  await ensurePlayerAccessColumns(db);

  // Keep every DDL statement separate. The Turso HTTP adapter cannot safely split
  // CREATE TRIGGER ... BEGIN ... END bodies when they are bundled into db.exec().
  await db.run(`
    CREATE TABLE IF NOT EXISTS evening_staff_assignments (
      evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id) ON DELETE CASCADE,
      organizer_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      assigned_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_evening_staff_organizer
      ON evening_staff_assignments(organizer_player_id)
  `);
  await ensureEveningFeeEvidenceSchema(db);

  // Legacy organizer-role triggers were global and could rewrite regular-evening
  // history merely because a player later received organizer permissions. Keep the
  // pre-existing exemption behavior only for non-regular formats; CASUAL/STANDARD
  // exemptions are now derived from evening-specific staff/waiver evidence.
  await db.run('DROP TRIGGER IF EXISTS trg_organizer_participant_fee_insert');
  await db.run('DROP TRIGGER IF EXISTS trg_organizer_participant_fee_update');
  await db.run(`
    CREATE TRIGGER trg_organizer_participant_fee_insert
    AFTER INSERT ON evening_participants
    WHEN EXISTS (
      SELECT 1 FROM players p
       WHERE p.id = NEW.player_id AND COALESCE(p.club_role, 'member') = 'organizer'
    )
      AND EXISTS (
        SELECT 1 FROM game_evenings e
         WHERE e.id = NEW.evening_id
           AND upper(COALESCE(e.format, '')) NOT IN ('CASUAL', 'STANDARD', '')
      )
    BEGIN
      UPDATE evening_participants
         SET amount_due = 0,
             amount_paid = 0,
             payment_status = 'waived'
       WHERE id = NEW.id;
    END
  `);
  await db.run(`
    CREATE TRIGGER trg_organizer_participant_fee_update
    AFTER UPDATE OF player_id, amount_due, amount_paid, payment_status ON evening_participants
    WHEN EXISTS (
      SELECT 1 FROM players p
       WHERE p.id = NEW.player_id AND COALESCE(p.club_role, 'member') = 'organizer'
    )
      AND EXISTS (
        SELECT 1 FROM game_evenings e
         WHERE e.id = NEW.evening_id
           AND upper(COALESCE(e.format, '')) NOT IN ('CASUAL', 'STANDARD', '')
      )
      AND (NEW.amount_due != 0 OR NEW.amount_paid != 0 OR NEW.payment_status != 'waived')
    BEGIN
      UPDATE evening_participants
         SET amount_due = 0,
             amount_paid = 0,
             payment_status = 'waived'
       WHERE id = NEW.id;
    END
  `);

  // Replace previous CRM-PAY-003 triggers so already-initialized databases receive
  // the corrected paid>0 status behavior as an application-managed schema migration.
  await db.run('DROP TRIGGER IF EXISTS trg_casual_planned_fee_insert');
  await db.run('DROP TRIGGER IF EXISTS trg_casual_planned_fee_update');

  // RSVP and slot selection are planning only. Until attendance is factual, CASUAL
  // participants must not persist a planned charge into the canonical debt fields.
  // A recorded prepayment remains factual money and therefore remains payment_status=paid.
  await db.run(`
    CREATE TRIGGER trg_casual_planned_fee_insert
    AFTER INSERT ON evening_participants
    WHEN COALESCE(NEW.attendance_status, 'pending') = 'pending'
      AND EXISTS (
        SELECT 1 FROM game_evenings e
         WHERE e.id = NEW.evening_id
           AND upper(COALESCE(e.format, 'CASUAL')) IN ('CASUAL', 'STANDARD', '')
      )
      AND (
        COALESCE(NEW.amount_due, 0) != 0
        OR COALESCE(NEW.payment_status, '') != CASE WHEN COALESCE(NEW.amount_paid, 0) > 0 THEN 'paid' ELSE 'waived' END
      )
    BEGIN
      UPDATE evening_participants
         SET amount_due = 0,
             payment_status = CASE WHEN COALESCE(amount_paid, 0) > 0 THEN 'paid' ELSE 'waived' END
       WHERE id = NEW.id;
    END
  `);

  await db.run(`
    CREATE TRIGGER trg_casual_planned_fee_update
    AFTER UPDATE OF amount_due, amount_paid, payment_status, attendance_status ON evening_participants
    WHEN COALESCE(NEW.attendance_status, 'pending') = 'pending'
      AND EXISTS (
        SELECT 1 FROM game_evenings e
         WHERE e.id = NEW.evening_id
           AND upper(COALESCE(e.format, 'CASUAL')) IN ('CASUAL', 'STANDARD', '')
      )
      AND (
        COALESCE(NEW.amount_due, 0) != 0
        OR COALESCE(NEW.payment_status, '') != CASE WHEN COALESCE(NEW.amount_paid, 0) > 0 THEN 'paid' ELSE 'waived' END
      )
    BEGIN
      UPDATE evening_participants
         SET amount_due = 0,
             payment_status = CASE WHEN COALESCE(amount_paid, 0) > 0 THEN 'paid' ELSE 'waived' END
       WHERE id = NEW.id;
    END
  `);

  await db.run('DROP TRIGGER IF EXISTS trg_player_becomes_organizer_fee_waiver');
  await db.run(`
    CREATE TRIGGER trg_player_becomes_organizer_fee_waiver
    AFTER UPDATE OF club_role ON players
    WHEN NEW.club_role = 'organizer' AND COALESCE(OLD.club_role, '') != 'organizer'
    BEGIN
      UPDATE evening_participants
         SET amount_due = 0,
             amount_paid = 0,
             payment_status = 'waived'
       WHERE player_id = NEW.id
         AND evening_id IN (
           SELECT id FROM game_evenings
            WHERE status != 'completed' AND settled_at IS NULL
              AND upper(COALESCE(format, '')) NOT IN ('CASUAL', 'STANDARD', '')
         );
    END
  `);

  const now = new Date().toISOString();

  // CASUAL/STANDARD is always 100 ₽ per factual game. Keep default_price canonical too
  // so legacy 600 ₽ does not leak through generic evening API/UI fields.
  await normalizeRegularEveningDefaults(db, now);
  await clearRegularPlannedCharges(db, now);

  // Canonical current club roles requested by the organizer. Access to the CRM itself
  // remains a separate entitlement in organizer_player_access.
  await db.run(
    `UPDATE players
        SET club_role = 'organizer', updated_at = ?
      WHERE id = ? OR lower(trim(nickname)) IN ('матроскина', 'гриня')`,
    [now, PRIMARY_ORGANIZER_PLAYER_ID],
  );

  // The canonical owner is also the club's full judge/host. Other organizers keep
  // their independently configured judge level until explicitly changed.
  await db.run(
    `UPDATE players
        SET judge_level = 'judge', updated_at = ?
      WHERE id = ?`,
    [now, PRIMARY_ORGANIZER_PLAYER_ID],
  );

  // Preserve the legacy organizer exemption for open non-regular events only.
  // Regular evenings use evening_staff_assignments / evening_fee_waivers and never
  // reduce a recorded amount_paid merely because the global role changed.
  await db.run(`
    UPDATE evening_participants
       SET amount_due = 0,
           amount_paid = 0,
           payment_status = 'waived',
           updated_at = ?
     WHERE player_id IN (
       SELECT id FROM players WHERE COALESCE(club_role, 'member') = 'organizer'
     )
       AND evening_id IN (
         SELECT id FROM game_evenings
          WHERE status != 'completed' AND settled_at IS NULL
            AND upper(COALESCE(format, '')) NOT IN ('CASUAL', 'STANDARD', '')
       )
  `, [now]);

  // For regular evenings a staff assignment is evidence, so do not manufacture one
  // from a global role. Historical and newly-created CASUAL evenings remain unassigned
  // until the organizer explicitly records who actually ran that evening.
  await db.run(`
    INSERT INTO evening_staff_assignments (evening_id, organizer_player_id, assigned_at, updated_at)
    SELECT e.id, ?, ?, ?
      FROM game_evenings e
     WHERE e.status != 'completed'
       AND upper(COALESCE(e.format, '')) NOT IN ('CASUAL', 'STANDARD', '')
       AND NOT EXISTS (SELECT 1 FROM evening_staff_assignments s WHERE s.evening_id = e.id)
       AND EXISTS (SELECT 1 FROM players p WHERE p.id = ?)
  `, [PRIMARY_ORGANIZER_PLAYER_ID, now, now, PRIMARY_ORGANIZER_PLAYER_ID]);

  // v1 keeps its durable marker semantics. R2 has a separate one-time marker because
  // deployments where v1 already completed must be rescanned once using the corrected
  // evening-specific exemption evidence. Neither scan repeats after completion.
  await reconcileHistoricalRegularEveningsOnce(db);
  await reconcileHistoricalRegularEveningsR2Once(db);

  ensuredDatabases.add(db as object);
}
