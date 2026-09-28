import type { DatabaseWrapper } from './index.ts';
import { normalizeEveningFormat } from '../lib/eveningFormat.ts';

export type PlayerGameLevel = 'unrated' | 'novice' | 'club' | 'tournament';
export type PlayerClubRole = 'guest' | 'member' | 'team' | 'organizer';

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
  await db.run('CREATE TABLE IF NOT EXISTS app_data_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  // Existing Turso databases skip the local initializeDatabase() migration path. Keep the
  // organizer-critical compatibility columns present here as wrapper-safe, idempotent ALTERs.
  await ensureColumn(db, 'players', 'game_level', "TEXT NOT NULL DEFAULT 'club'");
  await ensureColumn(db, 'players', 'club_role', "TEXT NOT NULL DEFAULT 'member'");
  await ensureColumn(db, 'players', 'contact_status', "TEXT NOT NULL DEFAULT 'normal'");
  await ensureColumn(db, 'players', 'do_not_invite_until', 'TEXT');
  await ensureColumn(db, 'organizer_tasks', 'automation_key', 'TEXT');
  await ensureColumn(db, 'evening_participants', 'table_id', 'TEXT');
  await ensureColumn(db, 'evening_participants', 'response_status', "TEXT NOT NULL DEFAULT 'unanswered'");
  await ensureColumn(db, 'game_evenings', 'settled_at', 'TEXT');

  await db.run(
    "UPDATE players SET game_level = 'club' WHERE game_level IS NULL OR game_level = '' OR game_level NOT IN ('unrated','novice','club','tournament')",
  );
  await db.run(
    "UPDATE players SET club_role = 'member' WHERE club_role IS NULL OR club_role = '' OR club_role NOT IN ('guest','member','team','organizer')",
  );

  // Historical roster correction only. Club-newness and mafia skill are independent;
  // this migration must not be reused to classify future registrations as novices.
  const clubRosterMigration = await db.get<{ id: string }>('SELECT id FROM app_data_migrations WHERE id = ?', ['2026-08-main-club-roster']);
  if (!clubRosterMigration) {
    await db.run("UPDATE players SET game_level = 'club' WHERE game_level = 'novice'");
    await db.run("UPDATE players SET lifecycle_status = 'normal' WHERE lifecycle_status = 'newcomer'");
    await db.run('INSERT INTO app_data_migrations (id, applied_at) VALUES (?, ?)', ['2026-08-main-club-roster', new Date().toISOString()]);
  }

  const playerColumns = await tableColumns(db, 'players');
  if (playerColumns.has('contact_status') && playerColumns.has('lifecycle_status')) {
    const contactMigration = await db.get<{ id: string }>('SELECT id FROM app_data_migrations WHERE id = ?', ['2026-08-canonical-contact-status']);
    if (!contactMigration) {
      await db.run("UPDATE players SET contact_status = lifecycle_status WHERE lifecycle_status IN ('blocked','paused') AND COALESCE(contact_status,'normal')='normal'");
      await db.run("UPDATE players SET contact_status = 'normal' WHERE contact_status IS NULL OR contact_status='' OR contact_status NOT IN ('normal','paused','blocked')");
      await db.run('INSERT INTO app_data_migrations (id, applied_at) VALUES (?, ?)', ['2026-08-canonical-contact-status', new Date().toISOString()]);
    }
  }

  // Owner decision 2026-09-28: there is no «unknown» level. Every new player starts as «Новичок»
  // (novice) until the organizer raises the level; an organizer-confirmed «Я уже умею играть» is «Играет в клубе».
  await db.run('DROP TRIGGER IF EXISTS trg_players_crm_manual_default_unrated');
  await db.run('DROP TRIGGER IF EXISTS trg_players_crm_manual_default_novice');
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS trg_players_crm_manual_default_novice
    AFTER INSERT ON players
    WHEN NEW.source IN ('crm_manual', 'manual', 'walk_in') AND NEW.game_level = 'club'
    BEGIN
      UPDATE players SET game_level = 'novice' WHERE id = NEW.id;
    END;
  `);

  // One-time: players still «unrated» become «Играет в клубе» when the organizer confirmed them as experienced
  // or they already played a club/rating/tournament evening; everyone else becomes «Новичок».
  const retireUnrated = await db.get<{ id: string }>('SELECT id FROM app_data_migrations WHERE id = ?', ['2026-09-retire-unrated-level']);
  if (!retireUnrated) {
    const hasStage = (await tableColumns(db, 'players')).has('club_stage');
    await db.run(`
      UPDATE players SET game_level = 'club'
       WHERE game_level = 'unrated'
         AND (${hasStage ? "club_stage = 'CLUB_PLAYER' OR " : ''}EXISTS (
           SELECT 1 FROM evening_participants ep JOIN game_evenings e ON e.id = ep.evening_id
            WHERE ep.player_id = players.id AND ep.attendance_status = 'attended'
              AND UPPER(COALESCE(e.format, 'CASUAL')) <> 'NOVICE'))
    `);
    await db.run("UPDATE players SET game_level = 'novice' WHERE game_level = 'unrated'");
    await db.run('INSERT INTO app_data_migrations (id, applied_at) VALUES (?, ?)', ['2026-09-retire-unrated-level', new Date().toISOString()]);
  }
}

export function playerLevelAllowsEveningFormat(level: string | null | undefined, format: string | null | undefined): boolean {
  const normalizedLevel: PlayerGameLevel =
    level === 'unrated' || level === 'novice' || level === 'tournament' ? level : 'club';
  const normalizedFormat = normalizeEveningFormat(format);

  // Legacy value only (retired 2026-09-28): an unassessed player is treated like a novice.
  if (normalizedLevel === 'unrated') return normalizedFormat === 'NOVICE';
  if (normalizedLevel === 'novice') return normalizedFormat === 'NOVICE';
  if (normalizedLevel === 'club') return normalizedFormat === 'NOVICE' || normalizedFormat === 'CASUAL';
  return normalizedFormat === 'CASUAL' || normalizedFormat === 'RATING' || normalizedFormat === 'TOURNAMENT';
}
