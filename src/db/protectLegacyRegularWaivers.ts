import type { DatabaseWrapper } from './index.ts';

const explicitWaiverPatterns = [
  /(?:освобожд(?:ен|ена|ено|ены|ение)|освободить).{0,40}(?:оплат|взнос|вечер)/iu,
  /(?:оплат|взнос|вечер).{0,40}(?:освобожд(?:ен|ена|ено|ены|ение)|освободить)/iu,
  /(?:бесплатн(?:ый|ая|ое|о)|без\s+оплаты).{0,40}(?:участ|игр|вечер|взнос)/iu,
  /(?:участ|игр|вечер|взнос).{0,40}(?:бесплатн(?:ый|ая|ое|о)|без\s+оплаты)/iu,
  /(?:waiv(?:ed|er)|fee\s+waiv(?:ed|er)|free\s+(?:entry|participation|evening))/iu,
];

export const isReliablyExplicitLegacyWaiverNote = (value: unknown): boolean => {
  const note = String(value || '').trim();
  if (!note) return false;
  return explicitWaiverPatterns.some((pattern) => pattern.test(note));
};

async function ensureProtectionSchema(db: DatabaseWrapper) {
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
    CREATE TABLE IF NOT EXISTS evening_fee_waiver_migration_diagnostics (
      participant_id TEXT PRIMARY KEY REFERENCES evening_participants(id) ON DELETE CASCADE,
      evening_id TEXT NOT NULL REFERENCES game_evenings(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'needs_review',
      detected_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

/**
 * Snapshot pre-R2 waived CASUAL rows before any historical pricing reconciliation.
 * This must run before CRM-PAY-003 v1 can rewrite payment_status/amount_due.
 */
export async function protectLegacyRegularWaiversBeforePricingMigration(db: DatabaseWrapper): Promise<void> {
  await ensureProtectionSchema(db);

  const rows = await db.all<any>(`
    SELECT ep.id AS participant_id, ep.evening_id, ep.notes,
           CASE WHEN w.participant_id IS NULL THEN 0 ELSE 1 END AS already_waived,
           CASE WHEN d.participant_id IS NULL THEN 0 ELSE 1 END AS already_diagnostic
      FROM evening_participants ep
      JOIN game_evenings e ON e.id = ep.evening_id
      LEFT JOIN evening_fee_waivers w ON w.participant_id = ep.id
      LEFT JOIN evening_fee_waiver_migration_diagnostics d ON d.participant_id = ep.id
     WHERE (e.status = 'completed' OR e.settled_at IS NOT NULL)
       AND upper(COALESCE(e.format, 'CASUAL')) IN ('CASUAL', 'STANDARD', '')
       AND ep.payment_status = 'waived'
       AND COALESCE(ep.amount_due, 0) = 0
       AND COALESCE(ep.attendance_status, '') = 'attended'
     ORDER BY e.starts_at ASC, ep.id ASC
  `);

  for (const row of rows) {
    if (Number(row.already_waived || 0) === 1 || Number(row.already_diagnostic || 0) === 1) continue;
    const now = new Date().toISOString();
    const participantId = String(row.participant_id);
    const eveningId = String(row.evening_id);
    const notes = String(row.notes || '').trim();

    if (isReliablyExplicitLegacyWaiverNote(notes)) {
      await db.run(`
        INSERT INTO evening_fee_waivers (participant_id, evening_id, reason, waived_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(participant_id) DO NOTHING
      `, [participantId, eveningId, `Migrated legacy explicit waiver: ${notes}`, now, now]);
      continue;
    }

    await db.run(`
      INSERT INTO evening_fee_waiver_migration_diagnostics
        (participant_id, evening_id, reason, status, detected_at, updated_at)
      VALUES (?, ?, ?, 'needs_review', ?, ?)
      ON CONFLICT(participant_id) DO NOTHING
    `, [
      participantId,
      eveningId,
      'Legacy waived participation is ambiguous and is held at zero debt until organizer review. No explicit fee-waiver evidence was reliably identified.',
      now,
      now,
    ]);
  }
}
