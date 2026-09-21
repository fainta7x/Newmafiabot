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
      source TEXT NOT NULL DEFAULT 'telegram',
      status TEXT NOT NULL DEFAULT 'NEW',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_novice_applications_status
      ON novice_applications(status)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_novice_applications_player
      ON novice_applications(player_id)
  `);

  const playerColumns = await db.all<{ name: string }>('PRAGMA table_info(players)');
  if (!playerColumns.some((column) => column.name === 'club_stage')) {
    await db.run("ALTER TABLE players ADD COLUMN club_stage TEXT NOT NULL DEFAULT 'NEW'");
  }

  const eveningColumns = await db.all<{ name: string }>('PRAGMA table_info(game_evenings)');
  if (!eveningColumns.some((column) => column.name === 'format')) {
    await db.run("ALTER TABLE game_evenings ADD COLUMN format TEXT NOT NULL DEFAULT 'CASUAL'");
  }
}
