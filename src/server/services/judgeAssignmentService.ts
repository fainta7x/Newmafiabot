import type { DatabaseWrapper } from '../../db/index.ts';

export interface JudgeAssignmentInput {
  judge_player_id?: string | null;
  judge_name?: string | null;
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

  const player = await db.get<{ id: string; nickname: string }>(
    'SELECT id, nickname FROM players WHERE id = ?',
    [judgePlayerId],
  );
  if (!player) {
    throw new JudgeAssignmentError('Игрок-судья не найден в CRM');
  }

  return {
    judge_player_id: player.id,
    judge_name: player.nickname,
  };
}
