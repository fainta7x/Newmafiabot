import type { DatabaseWrapper } from './index.ts';
import { PRIMARY_ORGANIZER_PLAYER_ID } from './ensureOrganizerPlayerAccessSchema.ts';

const ensuredDatabases = new WeakSet<object>();

async function ensurePlayerAccessColumns(db: DatabaseWrapper) {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(players)');
  if (!columns.some((column) => column.name === 'game_level')) {
    await db.run("ALTER TABLE players ADD COLUMN game_level TEXT NOT NULL DEFAULT 'club'");
  }
  if (!columns.some((column) => column.name === 'club_role')) {
    await db.run("ALTER TABLE players ADD COLUMN club_role TEXT NOT NULL DEFAULT 'member'");
  }
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

  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_organizer_participant_fee_insert
    AFTER INSERT ON evening_participants
    WHEN EXISTS (
      SELECT 1 FROM players p
       WHERE p.id = NEW.player_id AND COALESCE(p.club_role, 'member') = 'organizer'
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
    CREATE TRIGGER IF NOT EXISTS trg_organizer_participant_fee_update
    AFTER UPDATE OF player_id, amount_due, amount_paid, payment_status ON evening_participants
    WHEN EXISTS (
      SELECT 1 FROM players p
       WHERE p.id = NEW.player_id AND COALESCE(p.club_role, 'member') = 'organizer'
    ) AND (NEW.amount_due != 0 OR NEW.amount_paid != 0 OR NEW.payment_status != 'waived')
    BEGIN
      UPDATE evening_participants
         SET amount_due = 0,
             amount_paid = 0,
             payment_status = 'waived'
       WHERE id = NEW.id;
    END
  `);

  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_player_becomes_organizer_fee_waiver
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
         );
    END
  `);

  const now = new Date().toISOString();

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

  // Organizer status is a hard fee exemption for every open evening. This also
  // cleans current production rows created before the trigger existed.
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
         SELECT id FROM game_evenings WHERE status != 'completed' AND settled_at IS NULL
       )
  `, [now]);

  // The owner is the sensible default for still-open evenings. Historical completed
  // evenings stay unassigned until an organizer explicitly records who ran them.
  await db.run(`
    INSERT INTO evening_staff_assignments (evening_id, organizer_player_id, assigned_at, updated_at)
    SELECT e.id, ?, ?, ?
      FROM game_evenings e
     WHERE e.status != 'completed'
       AND NOT EXISTS (SELECT 1 FROM evening_staff_assignments s WHERE s.evening_id = e.id)
       AND EXISTS (SELECT 1 FROM players p WHERE p.id = ?)
  `, [PRIMARY_ORGANIZER_PLAYER_ID, now, now, PRIMARY_ORGANIZER_PLAYER_ID]);

  ensuredDatabases.add(db as object);
}
