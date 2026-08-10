import type { DatabaseWrapper } from '../../db/index.ts';
import { mutateTokenBalance } from './tokenLedgerService.ts';

export type ClubGameSettlementContext = 'completion' | 'correction' | 'reopen' | 'archive' | 'restore';

export interface ClubGameTokenFormulaInput {
  role: unknown;
  winnerTeam: unknown;
  judgeBonus?: unknown;
  protocolBonus?: unknown;
  bestMovePoints?: unknown;
  ciPoints?: unknown;
  disciplinaryPoints?: unknown;
  regularFouls?: unknown;
  minorTechnicalFouls?: unknown;
  majorTechnicalFouls?: unknown;
  removed?: boolean;
  ppkCulprit?: boolean;
}

export interface ClubGameTokenBreakdown {
  participation: number;
  victory: number;
  additional_points_tenths: number;
  additional_points_tokens: number;
  foul_bonus: number;
  minor_technical_penalty: number;
  major_technical_penalty: number;
  removal_penalty: number;
  ppk_penalty: number;
  uncapped_total: number;
  total: number;
}

interface SettlementRow {
  game_id: number;
  subject_type: 'player' | 'judge';
  player_id: string;
  target_amount: number;
  revision: number;
  breakdown_json: string | null;
  updated_at: string;
}

interface DesiredTarget {
  subjectType: 'player' | 'judge';
  playerId: string;
  amount: number;
  breakdown: ClubGameTokenBreakdown | { judge_reward: number };
}

const normalizeRole = (role: unknown): 'red' | 'black' | null => {
  const value = String(role || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный', 'sheriff', 'шериф'].includes(value)) return 'red';
  if (['mafia', 'мафия', 'маф', 'black', 'черный', 'don', 'дон'].includes(value)) return 'black';
  return null;
};

const normalizeWinner = (winner: unknown): 'red' | 'black' | null => {
  const value = String(winner || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['red', 'красные', 'красная', 'город'].includes(value)) return 'red';
  if (['black', 'черные', 'черная', 'мафия'].includes(value)) return 'black';
  return null;
};

const count = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
};

export const decimalPointsToTenths = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const tenths = Math.round(n * 10);
  if (!Number.isSafeInteger(tenths)) throw new Error('Дополнительные баллы выходят за безопасный диапазон');
  return tenths;
};

export const calculateClubGamePlayerTokens = (input: ClubGameTokenFormulaInput): ClubGameTokenBreakdown => {
  const roleTeam = normalizeRole(input.role);
  const winner = normalizeWinner(input.winnerTeam);
  const participation = 100;
  const victory = roleTeam && winner && roleTeam === winner ? 100 : 0;
  const additionalPointsTenths = [
    input.judgeBonus,
    input.protocolBonus,
    input.bestMovePoints,
    input.ciPoints,
    input.disciplinaryPoints,
  ].map(decimalPointsToTenths).reduce((sum, value) => sum + value, 0);
  const additionalPointsTokens = additionalPointsTenths * 10;
  const fouls = count(input.regularFouls);
  const foulBonus = fouls === 0 ? 15 : fouls === 1 ? 10 : fouls === 2 ? 5 : 0;
  const minorTechnicalPenalty = -30 * count(input.minorTechnicalFouls);
  const majorTechnicalPenalty = -60 * count(input.majorTechnicalFouls);
  const removalPenalty = input.removed ? -100 : 0;
  const ppkPenalty = input.ppkCulprit ? -500 : 0;
  const uncappedTotal = participation + victory + additionalPointsTokens + foulBonus
    + minorTechnicalPenalty + majorTechnicalPenalty + removalPenalty + ppkPenalty;
  if (!Number.isSafeInteger(uncappedTotal)) throw new Error('Расчёт жетонов выходит за безопасный целочисленный диапазон');
  return {
    participation,
    victory,
    additional_points_tenths: additionalPointsTenths,
    additional_points_tokens: additionalPointsTokens,
    foul_bonus: foulBonus,
    minor_technical_penalty: minorTechnicalPenalty,
    major_technical_penalty: majorTechnicalPenalty,
    removal_penalty: removalPenalty,
    ppk_penalty: ppkPenalty,
    uncapped_total: uncappedTotal,
    total: Math.max(-1000, uncappedTotal),
  };
};

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const calculateBestMovePoints = (seatNumbers: unknown, playerResults: any[]): number => {
  if (!Array.isArray(seatNumbers)) return 0;
  const roles = new Map<number, 'red' | 'black' | null>();
  for (const result of playerResults) roles.set(Number(result?.seat_number), normalizeRole(result?.role));
  let blackCount = 0;
  for (const seat of seatNumbers) if (roles.get(Number(seat)) === 'black') blackCount += 1;
  if (blackCount >= 3) return 0.6;
  if (blackCount === 2) return 0.3;
  if (blackCount === 1) return 0.1;
  return 0;
};

const bestMovePointsForParticipant = (protocol: any, participantId: string, playerResults: any[]): number => {
  const modern = Array.isArray(protocol?.best_moves) ? protocol.best_moves : [];
  const firstKilledParticipantId = String(protocol?.first_killed_participant_id || '');
  if (!participantId || participantId !== firstKilledParticipantId) return 0;
  const relevant = modern.filter((move: any) =>
    move?.source === 'first_killed' && String(move?.participant_id || '') === participantId
  );
  if (relevant.length) {
    return relevant.reduce((sum: number, move: any) => sum + calculateBestMovePoints(move?.seat_numbers, playerResults), 0);
  }
  if (
    String(protocol?.best_move_participant_id || '') === participantId
    && (!protocol?.best_move_source || protocol.best_move_source === 'first_killed')
  ) {
    return calculateBestMovePoints(protocol?.best_move_seats, playerResults);
  }
  return 0;
};

const buildDesiredTargets = async (db: DatabaseWrapper, game: any): Promise<Map<string, DesiredTarget>> => {
  const desired = new Map<string, DesiredTarget>();
  if (!game?.evening_id || game.archived_at) return desired;
  const payload = safeJsonParse<any>(game.protocol_text, null);
  if (!payload || payload.kind !== 'club_evening_protocol' || payload.version !== 1) return desired;
  if (payload.protocol?.status !== 'completed') return desired;
  const results = Array.isArray(payload.player_results) ? payload.player_results : [];
  if (results.length !== 10) throw new Error('Для начисления жетонов завершённая клубная игра должна содержать ровно 10 результатов');

  const playerIds = results.map((result: any) => String(result?.player_id || '').trim());
  if (playerIds.some((id: string) => !id) || new Set(playerIds).size !== 10) {
    throw new Error('Для начисления жетонов нужны 10 уникальных UUID игроков');
  }
  const placeholders = playerIds.map(() => '?').join(',');
  const existingPlayers = await db.all<{ id: string }>(`SELECT id FROM players WHERE id IN (${placeholders})`, playerIds);
  if (existingPlayers.length !== 10) throw new Error('Один или несколько UUID игроков завершённой игры отсутствуют в CRM');

  const winnerTeam = payload.protocol?.winner_team;
  const ppkParticipantId = payload.protocol?.end_reason === 'ppk'
    ? String(payload.protocol?.ppk_culprit_participant_id || '')
    : '';

  for (const result of results) {
    const playerId = String(result.player_id);
    const participantId = String(result.participant_id || '');
    const breakdown = calculateClubGamePlayerTokens({
      role: result.role,
      winnerTeam,
      judgeBonus: result.judge_bonus,
      protocolBonus: result.protocol_bonus,
      bestMovePoints: bestMovePointsForParticipant(payload.protocol, participantId, results),
      ciPoints: result.ci_points,
      disciplinaryPoints: result.disciplinary_penalty_points,
      regularFouls: result.regular_fouls,
      minorTechnicalFouls: result.minor_technical_fouls,
      majorTechnicalFouls: result.major_technical_fouls,
      removed: result.exit_type === 'removed',
      ppkCulprit: Boolean(participantId && participantId === ppkParticipantId),
    });
    desired.set(`player:${playerId}`, { subjectType: 'player', playerId, amount: breakdown.total, breakdown });
  }

  if (game.judge_player_id) {
    const judge = await db.get<{ id: string }>('SELECT id FROM players WHERE id = ?', [String(game.judge_player_id)]);
    if (judge) {
      desired.set(`judge:${judge.id}`, {
        subjectType: 'judge',
        playerId: judge.id,
        amount: 100,
        breakdown: { judge_reward: 100 },
      });
    }
  }
  return desired;
};

const rowKey = (subjectType: string, playerId: string) => `${subjectType}:${playerId}`;

export interface ReconcileClubGameSettlementOptions {
  activateIfUntracked?: boolean;
  context: ClubGameSettlementContext;
}

export const reconcileClubGameTokenSettlement = async (
  db: DatabaseWrapper,
  gameId: number,
  options: ReconcileClubGameSettlementOptions,
) => {
  if (!Number.isInteger(gameId) || gameId <= 0) throw new Error('Некорректный ID клубной игры для settlement');
  const game = await db.get<any>('SELECT * FROM games WHERE id = ?', [gameId]);
  if (!game) throw new Error('Клубная игра для settlement не найдена');
  if (!game.evening_id) return { managed: false, mutations: 0 };

  const existingRows = await db.all<SettlementRow>(
    'SELECT * FROM club_game_token_settlements WHERE game_id = ? ORDER BY subject_type, player_id',
    [gameId],
  );
  const managed = existingRows.length > 0;
  if (!managed && !options.activateIfUntracked) return { managed: false, mutations: 0 };

  const desired = await buildDesiredTargets(db, game);
  const current = new Map(existingRows.map((row) => [rowKey(row.subject_type, row.player_id), row]));
  const keys = new Set([...current.keys(), ...desired.keys()]);
  const now = new Date().toISOString();
  let mutations = 0;

  for (const key of [...keys].sort()) {
    const previous = current.get(key);
    const target = desired.get(key);
    const subjectType = (target?.subjectType || previous?.subject_type) as 'player' | 'judge';
    const playerId = target?.playerId || previous?.player_id;
    if (!playerId) continue;
    const previousAmount = Number(previous?.target_amount || 0);
    const nextAmount = Number(target?.amount || 0);
    if (!Number.isSafeInteger(previousAmount) || !Number.isSafeInteger(nextAmount)) throw new Error('Settlement target must be an integer');
    const delta = nextAmount - previousAmount;
    const revision = previous ? Number(previous.revision) + (delta === 0 ? 0 : 1) : (delta === 0 ? 0 : 1);
    const breakdown = target?.breakdown || safeJsonParse(previous?.breakdown_json, null);

    if (delta !== 0) {
      const reasonType = subjectType === 'judge' ? 'club_game_judge' : 'club_game_player';
      const actionWord = previous ? 'корректировка' : 'начисление';
      const description = subjectType === 'judge'
        ? `Игра №${game.global_game_number}: ${actionWord} жетонов судье`
        : `Игра №${game.global_game_number}: ${actionWord} жетонов игроку`;
      await mutateTokenBalance(db, {
        playerId,
        delta,
        reasonType,
        description,
        sourceType: reasonType,
        sourceId: String(gameId),
        idempotencyKey: `club-game:${gameId}:${subjectType}:${playerId}:rev:${revision}`,
        debitPolicy: 'allow_negative',
        actorType: 'system',
        actorId: null,
        metadata: {
          game_id: gameId,
          game_number: Number(game.global_game_number),
          subject_type: subjectType,
          previous_target: previousAmount,
          target: nextAmount,
          delta,
          revision,
          context: options.context,
          breakdown,
        },
      });
      mutations += 1;
    }

    await db.run(
      `INSERT INTO club_game_token_settlements
       (game_id, subject_type, player_id, target_amount, revision, breakdown_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(game_id, subject_type, player_id) DO UPDATE SET
         target_amount = excluded.target_amount,
         revision = excluded.revision,
         breakdown_json = excluded.breakdown_json,
         updated_at = excluded.updated_at`,
      [gameId, subjectType, playerId, nextAmount, revision, breakdown ? JSON.stringify(breakdown) : null, now],
    );
  }

  return { managed: true, mutations };
};
