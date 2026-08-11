import type { DatabaseWrapper } from './index.ts';
import { normalizeEveningFormat } from '../lib/eveningFormat.ts';

export type PlayerGameLevel = 'novice' | 'club' | 'tournament';

export async function ensureInviteAudienceSchema(db: DatabaseWrapper): Promise<void> {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(players)');
  if (!columns.some((column) => column.name === 'game_level')) {
    await db.run("ALTER TABLE players ADD COLUMN game_level TEXT NOT NULL DEFAULT 'club'");
  }

  await db.run(
    "UPDATE players SET game_level = 'club' WHERE game_level IS NULL OR game_level = '' OR game_level NOT IN ('novice','club','tournament')",
  );

  // Historical databases use `club` as the column default. Preserve existing players,
  // but make every future organizer-created CRM profile enter through the novice path.
  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_players_crm_manual_default_novice
    AFTER INSERT ON players
    WHEN NEW.source = 'crm_manual'
    BEGIN
      UPDATE players SET game_level = 'novice' WHERE id = NEW.id;
    END;
  `);
}

export function playerLevelAllowsEveningFormat(level: string | null | undefined, format: string | null | undefined): boolean {
  const normalizedLevel: PlayerGameLevel = level === 'novice' || level === 'tournament' ? level : 'club';
  const normalizedFormat = normalizeEveningFormat(format);

  if (normalizedLevel === 'novice') return normalizedFormat === 'NOVICE';
  if (normalizedLevel === 'club') {
    return normalizedFormat === 'NOVICE' || normalizedFormat === 'CASUAL';
  }
  return normalizedFormat === 'CASUAL' || normalizedFormat === 'RATING' || normalizedFormat === 'TOURNAMENT';
}
