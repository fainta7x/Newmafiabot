import type { DatabaseWrapper } from '../../db/index.ts';
import { judgeLevelAtLeast, normalizeJudgeLevel, type JudgeLevel } from '../../db/ensureJudgeAuthoritySchema.ts';

export interface JudgeAssignmentInput {
  judge_player_id?: string | null;
  judge_name?: string | null;
  required_level?: JudgeLevel;
}

export interface ResolvedJudgeAssignment {
  judge_player_id: string | null;
  judge_name: string | null;
}

export class JudgeAssignmentError extends Error {}

const normalizeOptionalText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};

const JUDGE_LEVEL_LABELS: Record<JudgeLevel, string> = {
  none: 'нет полномочий',
  trainee: 'Начинающий ведущий',
  host: 'Ведущий',
  judge: 'Судья',
};

export async function resolveJudgeAssignment(
  db: DatabaseWrapper,
  input: JudgeAssignmentInput,
): Promise<ResolvedJudgeAssignment> {
  const judgePlayerId = normalizeOptionalText(input.judge_player_id);
  if (!judgePlayerId) {
    return {
      judge_player_id: null,
      judge_name: normalizeOptionalText(input.judge_name),
    };
  }

  const player = await db.get<{ id: string; nickname: string; judge_level?: string | null }>(
    'SELECT id, nickname, judge_level FROM players WHERE id = ?',
    [judgePlayerId],
  );
  if (!player) {
    throw new JudgeAssignmentError('Игрок-судья не найден в CRM');
  }

  if (input.required_level && !judgeLevelAtLeast(player.judge_level, input.required_level)) {
    const actual = normalizeJudgeLevel(player.judge_level);
    throw new JudgeAssignmentError(
      `${player.nickname}: уровень «${JUDGE_LEVEL_LABELS[actual]}» недостаточен. Требуется «${JUDGE_LEVEL_LABELS[input.required_level]}»`,
    );
  }

  return {
    judge_player_id: player.id,
    judge_name: player.nickname,
  };
}
