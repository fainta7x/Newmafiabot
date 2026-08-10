import type { DatabaseWrapper } from './index.ts';

export async function ensureTournamentDistanceSchema(db: DatabaseWrapper): Promise<void> {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(tournaments)');
  if (!columns.some((column) => column.name === 'game_count')) {
    await db.run('ALTER TABLE tournaments ADD COLUMN game_count INTEGER NOT NULL DEFAULT 10');
  }

  // Existing tournaments keep their historical 10-game distance. Invalid legacy values
  // are repaired to 10, while any positive organizer-selected distance remains untouched.
  await db.run('UPDATE tournaments SET game_count = 10 WHERE game_count IS NULL OR game_count < 1');
}
