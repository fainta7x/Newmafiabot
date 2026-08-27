import type { DatabaseWrapper } from './index.ts';

const staffFeePredicate = "(club_role = 'organizer' OR judge_level IN ('host','judge'))";

export async function ensureEveningStaffSchema(db: DatabaseWrapper): Promise<void> {
  const eveningColumns = await db.all<{ name: string }>('PRAGMA table_info(game_evenings)');
  if (!eveningColumns.some((column) => column.name === 'organizer_player_id')) {
    await db.run('ALTER TABLE game_evenings ADD COLUMN organizer_player_id TEXT');
  }

  // Staff status is the billing source of truth. Organizers and full hosts/judges
  // do not owe the club an evening fee and must not enter settlement turnover.
  if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
    const now = new Date().toISOString();
    await db.run(
      `UPDATE players
       SET club_role = 'organizer',
           game_level = CASE WHEN game_level = 'novice' THEN 'club' ELSE game_level END,
           updated_at = ?
       WHERE nickname IN ('Матроскина','Гриня')`,
      [now],
    );
  }

  await db.run(
    `UPDATE evening_participants
     SET amount_due = 0, amount_paid = 0, payment_status = 'waived', updated_at = ?
     WHERE player_id IN (SELECT id FROM players WHERE ${staffFeePredicate})
       AND evening_id IN (SELECT id FROM game_evenings WHERE settled_at IS NULL AND status != 'completed')`,
    [new Date().toISOString()],
  );

  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_staff_fee_exempt_participant_insert
    AFTER INSERT ON evening_participants
    WHEN EXISTS (
      SELECT 1 FROM players p
      WHERE p.id = NEW.player_id
        AND (p.club_role = 'organizer' OR p.judge_level IN ('host','judge'))
    )
    BEGIN
      UPDATE evening_participants
      SET amount_due = 0, amount_paid = 0, payment_status = 'waived'
      WHERE id = NEW.id;
    END
  `);

  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_staff_fee_exempt_participant_update
    AFTER UPDATE OF amount_due, amount_paid, payment_status ON evening_participants
    WHEN (NEW.amount_due != 0 OR NEW.amount_paid != 0 OR NEW.payment_status != 'waived')
      AND EXISTS (
        SELECT 1 FROM players p
        WHERE p.id = NEW.player_id
          AND (p.club_role = 'organizer' OR p.judge_level IN ('host','judge'))
      )
      AND EXISTS (
        SELECT 1 FROM game_evenings e
        WHERE e.id = NEW.evening_id AND e.settled_at IS NULL AND e.status != 'completed'
      )
    BEGIN
      UPDATE evening_participants
      SET amount_due = 0, amount_paid = 0, payment_status = 'waived'
      WHERE id = NEW.id;
    END
  `);

  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_staff_fee_exempt_role_update
    AFTER UPDATE OF club_role, judge_level ON players
    WHEN NEW.club_role = 'organizer' OR NEW.judge_level IN ('host','judge')
    BEGIN
      UPDATE evening_participants
      SET amount_due = 0, amount_paid = 0, payment_status = 'waived'
      WHERE player_id = NEW.id
        AND evening_id IN (
          SELECT id FROM game_evenings WHERE settled_at IS NULL AND status != 'completed'
        );
    END
  `);
}

export function isFeeExemptStaff(player: { club_role?: unknown; judge_level?: unknown } | null | undefined): boolean {
  if (!player) return false;
  return player.club_role === 'organizer' || player.judge_level === 'host' || player.judge_level === 'judge';
}
