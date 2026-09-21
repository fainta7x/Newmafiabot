import type { DatabaseWrapper } from './index.ts';

/**
 * Core schema for the novice funnel.
 *
 * This intentionally separates:
 * - game_level: player experience in mafia;
 * - club_stage: relationship with 2LA Noire.
 *
 * A strong mafia player visiting from another city can still be NEW for the club.
 */
export async function ensureNoviceSystemSchema(db: DatabaseWrapper): Promise<void> {
  await db.run(`
    CREATE TABLE IF NOT EXISTS novice_applications (
      id TEXT PRIMARY KEY,
      player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      evening_id TEXT REFERENCES game_evenings(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'telegram',
      entry_route TEXT NOT NULL DEFAULT 'NOVICE',
      status TEXT NOT NULL DEFAULT 'NEW',
      notes TEXT,
      organizer_notes TEXT,
      decided_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const applicationColumns = await db.all<{ name: string }>('PRAGMA table_info(novice_applications)');
  const ensureApplicationColumn = async (name: string, definition: string) => {
    if (!applicationColumns.some((column) => column.name === name)) {
      await db.run(`ALTER TABLE novice_applications ADD COLUMN ${name} ${definition}`);
    }
  };
  await ensureApplicationColumn('evening_id', 'TEXT REFERENCES game_evenings(id) ON DELETE SET NULL');
  await ensureApplicationColumn('entry_route', "TEXT NOT NULL DEFAULT 'NOVICE'");
  await ensureApplicationColumn('organizer_notes', 'TEXT');
  await ensureApplicationColumn('decided_at', 'TEXT');

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_novice_applications_status
      ON novice_applications(status)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_novice_applications_player
      ON novice_applications(player_id)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_novice_applications_evening
      ON novice_applications(evening_id)
  `);

  const playerColumns = await db.all<{ name: string }>('PRAGMA table_info(players)');
  if (!playerColumns.some((column) => column.name === 'club_stage')) {
    await db.run("ALTER TABLE players ADD COLUMN club_stage TEXT NOT NULL DEFAULT 'NEW'");
    // The migration must not reinterpret the established club roster as fresh leads.
    // Profiles created after this migration keep the NEW default until the first
    // application is reviewed by an organizer.
    await db.run("UPDATE players SET club_stage = 'CLUB_PLAYER'");
  }

  const eveningColumns = await db.all<{ name: string }>('PRAGMA table_info(game_evenings)');
  if (!eveningColumns.some((column) => column.name === 'format')) {
    await db.run("ALTER TABLE game_evenings ADD COLUMN format TEXT NOT NULL DEFAULT 'CASUAL'");
  }
}
