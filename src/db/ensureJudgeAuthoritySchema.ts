import type { DatabaseWrapper } from './index.ts';
import { normalizeEveningFormat } from '../lib/eveningFormat.ts';
import { ORGANIZE_FORMATS, normalizeOrganizeFormats } from '../lib/organizeFormats.ts';

export type JudgeLevel = 'none' | 'trainee' | 'host' | 'judge';

const LEVEL_WEIGHT: Record<JudgeLevel, number> = {
  none: 0,
  trainee: 1,
  host: 2,
  judge: 3,
};

export function normalizeJudgeLevel(value: unknown): JudgeLevel {
  return value === 'trainee' || value === 'host' || value === 'judge' ? value : 'none';
}

export function requiredJudgeLevelForEveningFormat(format: string | null | undefined): JudgeLevel {
  const normalized = normalizeEveningFormat(format);
  if (normalized === 'NOVICE') return 'trainee';
  if (normalized === 'CASUAL') return 'host';
  return 'judge';
}

export function judgeLevelAtLeast(level: string | null | undefined, required: JudgeLevel): boolean {
  return LEVEL_WEIGHT[normalizeJudgeLevel(level)] >= LEVEL_WEIGHT[required];
}

export function judgeLevelAllowsEveningFormat(level: string | null | undefined, format: string | null | undefined): boolean {
  return judgeLevelAtLeast(level, requiredJudgeLevelForEveningFormat(format));
}

export async function ensureJudgeAuthoritySchema(db: DatabaseWrapper): Promise<void> {
  const columns = await db.all<{ name: string }>('PRAGMA table_info(players)');
  if (!columns.some((column) => column.name === 'judge_level')) {
    await db.run("ALTER TABLE players ADD COLUMN judge_level TEXT NOT NULL DEFAULT 'none'");
  }

  await db.run(
    "UPDATE players SET judge_level = 'none' WHERE judge_level IS NULL OR judge_level = '' OR judge_level NOT IN ('none','trainee','host','judge')",
  );
  // «Может вести» marks (src/lib/hostFormats.ts). NULL means «derive from judge_level», so nothing changes for existing players.
  if (!columns.some((column) => column.name === 'host_formats')) {
    await db.run('ALTER TABLE players ADD COLUMN host_formats TEXT');
  }
  // «Может проводить вечера» marks (src/lib/organizeFormats.ts); NULL = none.
  if (!columns.some((column) => column.name === 'organize_formats')) {
    await db.run('ALTER TABLE players ADD COLUMN organize_formats TEXT');
  }
  // «Перестал ходить» (owner decision 2026-09-30) is kept on its own, so it can be set even when the
  // mailing is already paused for another reason or the player is blocked. 1 = stopped coming.
  if (!columns.some((column) => column.name === 'stopped_attending')) {
    await db.run('ALTER TABLE players ADD COLUMN stopped_attending INTEGER NOT NULL DEFAULT 0');
  }
  // «Ходит иногда» on its own (src/lib/playerAccess.ts membershipOfPlayer); the old «guest» role means it too.
  if (!columns.some((column) => column.name === 'attends_sometimes')) {
    await db.run('ALTER TABLE players ADD COLUMN attends_sometimes INTEGER NOT NULL DEFAULT 0');
    if (columns.some((column) => column.name === 'club_role')) await db.run("UPDATE players SET attends_sometimes = 1 WHERE club_role = 'guest'");
  }
  // «Из другого города» (owner decision 2026-09-30, src/lib/playerAccess.ts). 1 = a guest from another city.
  if (!columns.some((column) => column.name === 'from_other_city')) {
    await db.run('ALTER TABLE players ADD COLUMN from_other_city INTEGER NOT NULL DEFAULT 0');
  }
  // Owner decision 2026-09-29: «Турниры» became a mark of its own, apart from «Рейтинговые вечера».
  // Players who had the old «Рейтинг и турниры» mark (stored as RATING) keep both rights. Runs once.
  await db.run('CREATE TABLE IF NOT EXISTS app_data_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const tournamentMarkKey = '2026-09-organize-tournament-mark';
  if (!(await db.get('SELECT id FROM app_data_migrations WHERE id = ?', [tournamentMarkKey]))) {
    const marked = await db.all<{ id: string; organize_formats: string }>(
      "SELECT id, organize_formats FROM players WHERE ',' || REPLACE(UPPER(COALESCE(organize_formats, '')), ' ', '') || ',' LIKE '%,RATING,%'",
    );
    for (const player of marked) {
      const formats = normalizeOrganizeFormats(player.organize_formats);
      if (formats.includes('TOURNAMENT')) continue;
      const next = ORGANIZE_FORMATS.filter((format) => format === 'TOURNAMENT' || formats.includes(format));
      await db.run('UPDATE players SET organize_formats = ? WHERE id = ?', [next.join(','), player.id]);
    }
    await db.run('INSERT OR IGNORE INTO app_data_migrations (id, applied_at) VALUES (?, ?)', [tournamentMarkKey, new Date().toISOString()]);
  }
}
