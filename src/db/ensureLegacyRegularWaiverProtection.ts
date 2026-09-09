import type { DatabaseWrapper } from './index.ts';

const isRegularFormat = (value: unknown): boolean => {
  const format = String(value || 'CASUAL').trim().toUpperCase();
  return format === '' || format === 'CASUAL' || format === 'STANDARD';
};

const hasExplicitLegacyWaiverEvidence = (value: unknown): boolean => {
  const note = String(value || '').trim().toLowerCase();
  if (!note) return false;

  // Financial migrations must be conservative. Generic words such as "free",
  // "бесплатный" or "льгота" are not enough on their own because the note may
  // describe parking, venue access, a promotion, etc. Only wording that explicitly
  // ties the waiver to participation/payment is promoted to durable waiver evidence.
  return [
    /\b(?:fee|payment)\s+waiv(?:e|ed|er|ing)\b/i,
    /\bwaiv(?:e|ed|er|ing)\s+(?:fee|payment)\b/i,
    /\bfree\s+(?:participation|entry)\b/i,
    /освобожд(?:ен(?:а|о|ы)?|ена|ение|ён(?:а|о|ы)?)\s+от\s+(?:оплаты|взноса)/i,
    /(?:оплата|взнос)\s+(?:не\s+требуется|не\s+нужен|снят|отмен[её]н)/i,
    /бесплатн(?:ое|ая|ый|ые)\s+участие/i,
  ].some((pattern) => pattern.test(note));
};

async function ensurePlayerEvidenceColumns(db: DatabaseWrapper): Promise<void> {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(players)');
  if (!columns.some((column) => column.name === 'club_role')) {
    await db.run("ALTER TABLE players ADD COLUMN club_role TEXT NOT NULL DEFAULT 'member'");
  }
  if (!columns.some((column) => column.name === 'judge_level')) {
    await db.run("ALTER TABLE players ADD COLUMN judge_level TEXT NOT NULL DEFAULT 'none'");
  }
}

async function ensureEvidenceTables(db: DatabaseWrapper): Promise<void> {
  await db.run(`
    CREATE TABLE IF NOT EXISTS evening_staff_assignments (
      evening_id TEXT PRIMARY KEY REFERENCES game_evenings(id) ON DELETE CASCADE,
      organizer_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      assigned_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
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
 * Protect pre-R2 historical waived rows before *any* CRM-PAY-003 reconciliation.
 *
 * This intentionally runs before ensureClubOperationsSchema from createApp. The old
 * v1 migration can otherwise convert `waived + due=0` into debt before R2 has a
 * chance to distinguish a real waiver from the former global judge/organizer rule.
 */
export async function ensureLegacyRegularWaiverProtection(db: DatabaseWrapper): Promise<void> {
  await ensurePlayerEvidenceColumns(db);
  await ensureEvidenceTables(db);

  const rows = await db.all<any>(`
    SELECT ep.id AS participant_id, ep.evening_id, ep.player_id, ep.notes,
           p.club_role, p.judge_level, e.format,
           s.organizer_player_id,
           CASE WHEN w.participant_id IS NULL THEN 0 ELSE 1 END AS already_waived,
           CASE WHEN d.participant_id IS NULL THEN 0 ELSE 1 END AS already_diagnostic
      FROM evening_participants ep
      JOIN game_evenings e ON e.id = ep.evening_id
      JOIN players p ON p.id = ep.player_id
      LEFT JOIN evening_staff_assignments s ON s.evening_id = ep.evening_id
      LEFT JOIN evening_fee_waivers w ON w.participant_id = ep.id
      LEFT JOIN evening_fee_waiver_migration_diagnostics d ON d.participant_id = ep.id
     WHERE (e.status = 'completed' OR e.settled_at IS NOT NULL)
       AND ep.payment_status = 'waived'
       AND COALESCE(ep.amount_due, 0) = 0
       AND COALESCE(ep.attendance_status, '') = 'attended'
     ORDER BY e.starts_at ASC, ep.id ASC
  `);

  for (const row of rows) {
    if (!isRegularFormat(row.format)) continue;
    if (Number(row.already_waived || 0) === 1 || Number(row.already_diagnostic || 0) === 1) continue;
    if (row.organizer_player_id && String(row.organizer_player_id) === String(row.player_id)) continue;

    const timestamp = new Date().toISOString();
    if (hasExplicitLegacyWaiverEvidence(row.notes)) {
      await db.run(`
        INSERT INTO evening_fee_waivers (participant_id, evening_id, reason, waived_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(participant_id) DO NOTHING
      `, [
        String(row.participant_id),
        String(row.evening_id),
        `Migrated pre-reconciliation explicit waiver: ${String(row.notes).trim()}`,
        timestamp,
        timestamp,
      ]);
      continue;
    }

    const formerGlobalRulePossible = String(row.club_role || '') === 'organizer'
      || ['host', 'judge'].includes(String(row.judge_level || ''));
    const reason = formerGlobalRulePossible
      ? 'Legacy waived participation may come from the former global organizer/judge exemption; explicit organizer review is required before charging.'
      : 'Legacy waived participation is not reliably identifiable as an explicit payment waiver; explicit organizer review is required before charging.';

    await db.run(`
      INSERT INTO evening_fee_waiver_migration_diagnostics
        (participant_id, evening_id, reason, status, detected_at, updated_at)
      VALUES (?, ?, ?, 'needs_review', ?, ?)
      ON CONFLICT(participant_id) DO NOTHING
    `, [String(row.participant_id), String(row.evening_id), reason, timestamp, timestamp]);
  }
}
