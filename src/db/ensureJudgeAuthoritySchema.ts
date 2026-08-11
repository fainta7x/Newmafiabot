import type { DatabaseWrapper } from './index.ts';
import { normalizeEveningFormat } from '../lib/eveningFormat.ts';

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
}
