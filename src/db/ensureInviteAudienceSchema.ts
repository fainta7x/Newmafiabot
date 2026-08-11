import type { DatabaseWrapper } from './index.ts';
import { normalizeEveningFormat } from '../lib/eveningFormat.ts';

export type PlayerGameLevel = 'novice' | 'club' | 'tournament';

const tableColumns = async (db: DatabaseWrapper, table: string) =>
  new Set((await db.all<{ name: string }>(`PRAGMA table_info(${table})`)).map((column) => String(column.name)));

async function ensureColumn(
  db: DatabaseWrapper,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const columns = await tableColumns(db, table);
  if (columns.size === 0 || columns.has(column)) return;
  await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function ensureInviteAudienceSchema(db: DatabaseWrapper): Promise<void> {
  // Existing Turso databases skip the local initializeDatabase() migration path. Keep the
  // organizer-critical compatibility columns present here as wrapper-safe, idempotent ALTERs.
  await ensureColumn(db, 'players', 'game_level', "TEXT NOT NULL DEFAULT 'club'");
  await ensureColumn(db, 'players', 'contact_status', "TEXT NOT NULL DEFAULT 'normal'");
  await ensureColumn(db, 'players', 'do_not_invite_until', 'TEXT');
  await ensureColumn(db, 'organizer_tasks', 'automation_key', 'TEXT');
  await ensureColumn(db, 'evening_participants', 'table_id', 'TEXT');
  await ensureColumn(db, 'evening_participants', 'response_status', "TEXT NOT NULL DEFAULT 'unanswered'");
  await ensureColumn(db, 'game_evenings', 'settled_at', 'TEXT');

  await db.run(
    "UPDATE players SET game_level = 'club' WHERE game_level IS NULL OR game_level = '' OR game_level NOT IN ('novice','club','tournament')",
  );

  const playerColumns = await tableColumns(db, 'players');
  if (playerColumns.has('contact_status') && playerColumns.has('lifecycle_status')) {
    await db.run(
      "UPDATE players SET contact_status = CASE WHEN lifecycle_status='blocked' THEN 'blocked' WHEN lifecycle_status='paused' THEN 'paused' ELSE 'normal' END WHERE contact_status IS NULL OR contact_status=''",
    );
  }

  // Turso's exec compatibility splits scripts on semicolons. CREATE TRIGGER must be sent
  // as one complete statement, so use run() just like the Telegram publishing triggers.
  // Historical databases use `club` as the column default. Preserve existing players,
  // but make every future organizer-created CRM profile enter through the novice path.
  await db.run(`
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
