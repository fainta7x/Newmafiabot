import type { DatabaseWrapper } from '../../db/index.ts';
import { calculateClubGamePlayerTokens } from './clubGameTokenSettlementService.ts';
import { mutateTokenBalance } from './tokenLedgerService.ts';

export type TournamentGameSettlementContext = 'completion' | 'reopen' | 'backfill';

type SettlementRow = {
  game_id: string;
  subject_type: 'player' | 'judge';
  player_id: string;
  target_amount: number;
  revision: number;
  breakdown_json: string | null;
  updated_at: string;
};

type DesiredTarget = {
  subjectType: 'player' | 'judge';
  playerId: string;
  amount: number;
  breakdown: unknown;
};

const safeJsonParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const roleTeam = (role: unknown): 'red' | 'black' | null => {
  const value = String(role || '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный', 'sheriff', 'шериф'].includes(value)) return 'red';
  if (['mafia', 'мафия', 'маф', 'black', 'черный', 'don', 'дон'].includes(value)) return 'black';
  return null;
};

const calculateBestMovePoints = (seatNumbers: unknown, seats: any[]): number => {
  if (!Array.isArray(seatNumbers)) return 0;
  const teams = new Map<number, 'red' | 'black' | null>(
    seats.map((seat: any) => [Number(seat.seat_number), roleTeam(seat.role)]),
  );
  const blackCount = seatNumbers.reduce(
    (sum: number, seat: unknown) => sum + (teams.get(Number(seat)) === 'black' ? 1 : 0),
    0,
  );
  if (blackCount >= 3) return 0.6;
  if (blackCount === 2) return 0.3;
  if (blackCount === 1) return 0.1;
  return 0;
};

const buildDesiredTargets = async (db: DatabaseWrapper, gameId: string): Promise<Map<string, DesiredTarget>> => {
  const desired = new Map<string, DesiredTarget>();
  const game = await db.get<any>(`
    SELECT tg.*, t.title AS tournament_title
      FROM tournament_games tg
      JOIN tournaments t ON t.id = tg.tournament_id
     WHERE tg.id = ?
  `, [gameId]);
  if (!game || game.status !== 'completed') return desired;

  const protocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
  if (!protocol || protocol.status !== 'completed') return desired;

  const seats = await db.all<any>(`
    SELECT tgs.participant_id, tgs.seat_number, tgs.role,
           tp.player_id, tp.display_name
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
     WHERE tgs.game_id = ?
     ORDER BY tgs.seat_number ASC
  `, [gameId]);
  if (seats.length !== 10) throw new Error('Для начисления жетонов турнирная игра должна содержать ровно 10 мест');
  const playerIds = seats.map((seat: any) => String(seat.player_id || '').trim());
  if (playerIds.some((id: string) => !id) || new Set(playerIds).size !== 10) {
    throw new Error('Для начисления жетонов турнирной игры нужны 10 уникальных UUID игроков');
  }

  const resultRows = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
  const resultsByParticipant = new Map(resultRows.map((row: any) => [String(row.participant_id), row]));
  const bestMoveRows = await db.all<any>('SELECT participant_id, source, seat_numbers_json FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
  const bestMoveByParticipant = new Map<string, number>();
  for (const move of bestMoveRows) {
    // Keep the same token semantics as club games: token bonus is for the first-killed best move.
    if (move.source !== 'first_killed') continue;
    const participantId = String(move.participant_id || '');
    const points = calculateBestMovePoints(safeJsonParse(move.seat_numbers_json, []), seats);
    bestMoveByParticipant.set(participantId, (bestMoveByParticipant.get(participantId) || 0) + points);
  }

  const ppkParticipantId = protocol.end_reason === 'ppk'
    ? String(protocol.ppk_culprit_participant_id || '')
    : '';

  for (const seat of seats) {
    const participantId = String(seat.participant_id);
    const playerId = String(seat.player_id);
    const result: any = resultsByParticipant.get(participantId) || {};
    const breakdown = calculateClubGamePlayerTokens({
      role: seat.role,
      winnerTeam: protocol.winner_team || game.winner_team,
      judgeBonus: result.judge_bonus,
      protocolBonus: result.protocol_bonus,
      bestMovePoints: bestMoveByParticipant.get(participantId) || 0,
      ciPoints: result.ci_points,
      disciplinaryPoints: result.disciplinary_penalty_points,
      regularFouls: result.regular_fouls,
      minorTechnicalFouls: result.minor_technical_fouls,
      majorTechnicalFouls: result.major_technical_fouls,
      removed: result.exit_type === 'removed',
      ppkCulprit: Boolean(participantId && participantId === ppkParticipantId),
    });
    desired.set(`player:${playerId}`, {
      subjectType: 'player',
      playerId,
      amount: breakdown.total,
      breakdown,
    });
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

const keyFor = (subjectType: string, playerId: string) => `${subjectType}:${playerId}`;

export async function reconcileTournamentGameTokenSettlement(
  db: DatabaseWrapper,
  gameId: string,
  options: { activateIfUntracked?: boolean; context: TournamentGameSettlementContext },
) {
  const existingRows = await db.all<SettlementRow>(
    'SELECT * FROM tournament_game_token_settlements WHERE game_id = ? ORDER BY subject_type, player_id',
    [gameId],
  );
  const managed = existingRows.length > 0;
  if (!managed && !options.activateIfUntracked) return { managed: false, mutations: 0 };

  const desired = await buildDesiredTargets(db, gameId);
  const current = new Map(existingRows.map((row) => [keyFor(row.subject_type, row.player_id), row]));
  const keys = new Set([...current.keys(), ...desired.keys()]);
  const game = await db.get<any>(`
    SELECT tg.game_number, t.title AS tournament_title
      FROM tournament_games tg
      JOIN tournaments t ON t.id = tg.tournament_id
     WHERE tg.id = ?
  `, [gameId]);
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
    if (!Number.isSafeInteger(previousAmount) || !Number.isSafeInteger(nextAmount)) {
      throw new Error('Tournament token settlement target must be an integer');
    }
    const delta = nextAmount - previousAmount;
    const revision = previous ? Number(previous.revision) + (delta === 0 ? 0 : 1) : (delta === 0 ? 0 : 1);
    const breakdown = target?.breakdown || safeJsonParse(previous?.breakdown_json, null);

    if (delta !== 0) {
      const reasonType = subjectType === 'judge' ? 'tournament_game_judge' : 'tournament_game_player';
      const title = game?.tournament_title || 'Турнир';
      const gameNumber = Number(game?.game_number || 0);
      await mutateTokenBalance(db, {
        playerId,
        delta,
        reasonType,
        description: subjectType === 'judge'
          ? `${title} · игра №${gameNumber}: жетоны судье`
          : `${title} · игра №${gameNumber}: жетоны игроку`,
        sourceType: reasonType,
        sourceId: String(gameId),
        idempotencyKey: `tournament-game:${gameId}:${subjectType}:${playerId}:rev:${revision}`,
        debitPolicy: 'allow_negative',
        actorType: 'system',
        actorId: null,
        metadata: {
          game_id: String(gameId),
          game_number: gameNumber,
          tournament_title: title,
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
      `INSERT INTO tournament_game_token_settlements
       (game_id, subject_type, player_id, target_amount, revision, breakdown_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(game_id, subject_type, player_id) DO UPDATE SET
         target_amount = excluded.target_amount,
         revision = excluded.revision,
         breakdown_json = excluded.breakdown_json,
         updated_at = excluded.updated_at`,
      [String(gameId), subjectType, playerId, nextAmount, revision, breakdown ? JSON.stringify(breakdown) : null, now],
    );
  }

  return { managed: true, mutations };
}

export async function reconcileAllTournamentGameTokenSettlements(db: DatabaseWrapper): Promise<number> {
  const games = await db.all<{ id: string }>(`
    SELECT tg.id
      FROM tournament_games tg
      JOIN tournament_game_protocols p ON p.game_id = tg.id
     WHERE tg.status = 'completed' AND p.status = 'completed'
     ORDER BY tg.completed_at ASC, tg.id ASC
  `);
  let mutations = 0;
  for (const game of games) {
    const result = await reconcileTournamentGameTokenSettlement(db, String(game.id), {
      activateIfUntracked: true,
      context: 'backfill',
    });
    mutations += result.mutations;
  }
  return mutations;
}
