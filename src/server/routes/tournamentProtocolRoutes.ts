import { Router, Response } from 'express';
import crypto from 'crypto';
import { DatabaseWrapper } from '../../db/index.ts';
import { requireOrganizerAuth, AuthenticatedRequest } from '../auth.ts';
import { calculateDisciplinaryPenalty } from '../../lib/gameDiscipline.ts';

const router = Router();

function normalizeRole(r: string | null | undefined): string | null {
  if (!r) return null;
  const lower = r.trim().toLowerCase();
  if (['citizen', 'мирный', 'мирный житель', 'red', 'красный'].includes(lower)) return 'citizen';
  if (['sheriff', 'шериф'].includes(lower)) return 'sheriff';
  if (['mafia', 'мафия', 'black', 'черный'].includes(lower)) return 'mafia';
  if (['don', 'дон'].includes(lower)) return 'don';
  return lower;
}

export function calculateBestMovePoints(
  bestMoveSeats: number[],
  seats: Array<{ seat_number: number; role: string | null }>
): { guessedBlacks: number; bonusPoints: number } {
  if (!bestMoveSeats || bestMoveSeats.length === 0) {
    return { guessedBlacks: 0, bonusPoints: 0 };
  }

  const roleMap = new Map<number, string>();
  for (const s of seats) {
    const r = normalizeRole(s.role);
    if (r) roleMap.set(s.seat_number, r);
  }

  let guessedBlacks = 0;
  for (const seatNum of bestMoveSeats) {
    const r = roleMap.get(seatNum);
    if (r === 'mafia' || r === 'don') {
      guessedBlacks++;
    }
  }

  let bonusPoints = 0;
  if (guessedBlacks === 1) bonusPoints = 0.1;
  else if (guessedBlacks === 2) bonusPoints = 0.3;
  else if (guessedBlacks >= 3) bonusPoints = 0.6;

  return { guessedBlacks, bonusPoints };
}

const VALID_EXIT_TYPES = ['alive', 'killed', 'voted_zero_round', 'voted_day', 'removed'];
const VALID_COLOR_MARKS = ['red', 'black', 'sheriff'];

function validateFirstKilled(
  firstKilledParticipantId: string | null | undefined,
  seats: any[],
  playerResults: any[],
  shots: any[]
): string | null {
  if (!firstKilledParticipantId) {
    if (Array.isArray(shots)) {
      const night1 = shots.find((s) => s && Number(s.night_number) === 1);
      if (night1 && night1.result === 'killed') {
        return 'В первую ночь был убит игрок, но первоубиенный не выбран в протоколе';
      }
    }
    return null;
  }

  const fkSeat = seats.find((s) => s.participant_id === firstKilledParticipantId);
  if (!fkSeat) {
    return 'Первоубиенный игрок не найден среди участников этой игры';
  }

  const normRole = normalizeRole(fkSeat.role);
  if (normRole !== 'citizen' && normRole !== 'sheriff') {
    return `Первоубиенным может быть только мирный житель или Шериф (роль выбранного игрока: ${fkSeat.role || 'не указана'})`;
  }

  if (playerResults && Array.isArray(playerResults)) {
    const fkResult = playerResults.find((pr) => pr.participant_id === firstKilledParticipantId);
    if (fkResult && fkResult.exit_type !== 'killed') {
      return 'Первоубиенный игрок должен иметь тип ухода "killed" (убит ночью)';
    }
  }

  if (Array.isArray(shots)) {
    const night1 = shots.find((s) => s && Number(s.night_number) === 1);
    if (night1) {
      if (night1.result === 'killed') {
        if (Number(night1.target_seat) !== Number(fkSeat.seat_number)) {
          return `Выбранный первоубиенный игрок (слот ${fkSeat.seat_number}) не совпадает с целью убийства в первую ночь (слот ${night1.target_seat})`;
        }
      } else if (night1.result === 'miss' || night1.result === 'agreement_failed') {
        return `В первую ночь был промах или нестрел, первоубиенного быть не должно`;
      }
    }
  }

  return null;
}

function validateBestMoves(
  bestMoves: any[],
  firstKilledParticipantId: string | null | undefined,
  zeroRoundVotedParticipantId: string | null | undefined,
  allParticipantIds: string[],
  playerResults?: any[]
): string | null {
  if (
    firstKilledParticipantId &&
    zeroRoundVotedParticipantId &&
    firstKilledParticipantId === zeroRoundVotedParticipantId
  ) {
    return 'Первоубиенный игрок и заголосованный в нулевой круг не могут быть одним и тем же игроком';
  }

  if (firstKilledParticipantId) {
    if (!allParticipantIds.includes(firstKilledParticipantId)) {
      return 'Первоубиенный игрок не является участником этой игры';
    }
    if (playerResults && Array.isArray(playerResults)) {
      const fkResult = playerResults.find((pr) => pr.participant_id === firstKilledParticipantId);
      if (fkResult && fkResult.exit_type !== 'killed') {
        return 'Первоубиенный игрок должен иметь тип ухода "killed" (убит ночью)';
      }
    }
  }

  if (zeroRoundVotedParticipantId) {
    if (!allParticipantIds.includes(zeroRoundVotedParticipantId)) {
      return 'Заголосованный в нулевой круг игрок не является участником этой игры';
    }
    if (playerResults && Array.isArray(playerResults)) {
      const zrResult = playerResults.find((pr) => pr.participant_id === zeroRoundVotedParticipantId);
      if (zrResult && zrResult.exit_type !== 'voted_zero_round') {
        return 'Заголосованный в нулевой круг игрок должен иметь тип ухода "voted_zero_round"';
      }
    }
  }

  if (!bestMoves) return null;
  if (!Array.isArray(bestMoves)) return 'best_moves должен быть массивом';
  if (bestMoves.length > 2) return 'В игре не может быть более двух ЛХ';

  const seenSources = new Set<string>();
  const seenParticipants = new Set<string>();

  for (const bm of bestMoves) {
    if (!bm.participant_id || typeof bm.participant_id !== 'string') {
      return 'participant_id должен быть строкой';
    }
    if (!allParticipantIds.includes(bm.participant_id)) {
      return 'Участник ЛХ не найден в этой игре';
    }

    if (bm.source !== 'first_killed' && bm.source !== 'zero_round_voted') {
      return 'Недопустимый источник ЛХ';
    }

    if (seenSources.has(bm.source)) {
      return 'Источник ЛХ не может повторяться';
    }
    seenSources.add(bm.source);

    if (seenParticipants.has(bm.participant_id)) {
      return 'Один участник не может иметь два ЛХ';
    }
    seenParticipants.add(bm.participant_id);

    if (bm.source === 'first_killed' && bm.participant_id !== firstKilledParticipantId) {
      return 'Для ЛХ первого убитого участник обязан совпадать с first_killed_participant_id';
    }

    if (bm.source === 'zero_round_voted' && bm.participant_id !== zeroRoundVotedParticipantId) {
      return 'Для ЛХ выбывшего в нулевом круге участник обязан совпадать с zero_round_voted_participant_id';
    }

    if (!Array.isArray(bm.seat_numbers)) {
      return 'ЛХ должен содержать массив номеров мест (seat_numbers)';
    }

    if (bm.seat_numbers.length > 3) {
      return 'В ЛХ нельзя указать больше 3 номеров';
    }

    const seenSeats = new Set<number>();
    for (const seatNum of bm.seat_numbers) {
      if (typeof seatNum !== 'number') {
        return 'Все номера мест в ЛХ должны быть числами';
      }
      if (!Number.isInteger(seatNum) || seatNum < 1 || seatNum > 10) {
        return 'Все номера мест в ЛХ должны быть целыми числами от 1 до 10';
      }
      if (seenSeats.has(seatNum)) {
        return 'Номера мест в ЛХ не могут повторяться';
      }
      seenSeats.add(seatNum);
    }
  }

  return null;
}

function validatePlayerResults(
  playerResults: any[],
  gameSeats: any[],
  firstKilledParticipantId?: string | null
): string | null {
  if (!Array.isArray(playerResults)) {
    return 'Результаты игроков должны быть массивом';
  }

  if (playerResults.length !== 10) {
    return 'Результаты игроков должны содержать ровно 10 записей';
  }

  const seatParticipantIds = gameSeats.map((s) => s.participant_id);
  const seenParticipantIds = new Set<string>();

  for (const pr of playerResults) {
    if (!pr.participant_id || !seatParticipantIds.includes(pr.participant_id)) {
      return 'Результаты содержат участника, не принадлежащего этой игре';
    }

    if (seenParticipantIds.has(pr.participant_id)) {
      return 'Результаты игроков содержат дубликаты участников';
    }
    seenParticipantIds.add(pr.participant_id);

    if (pr.exit_type !== undefined && !VALID_EXIT_TYPES.includes(pr.exit_type)) {
      return `Недопустимый тип ухода из игры: ${pr.exit_type}`;
    }

    if (pr.exit_order !== undefined && pr.exit_order !== null) {
      if (!Number.isInteger(pr.exit_order) || pr.exit_order < 1 || pr.exit_order > 10) {
        return 'Порядок ухода из игры должен быть целым числом от 1 до 10 или null';
      }
    }

    if (pr.regular_fouls !== undefined) {
      if (!Number.isInteger(pr.regular_fouls) || pr.regular_fouls < 0 || pr.regular_fouls > 4) {
        return 'Обычные фолы должны быть целым числом от 0 до 4';
      }
    }

    if (pr.technical_fouls !== undefined) {
      if (!Number.isInteger(pr.technical_fouls) || pr.technical_fouls < 0 || pr.technical_fouls > 4) {
        return 'Технические фолы должны быть целым числом от 0 до 4';
      }
    }

    if (pr.judge_bonus !== undefined && (typeof pr.judge_bonus !== 'number' || !Number.isFinite(pr.judge_bonus))) {
      return 'Бонусные баллы судьи должны быть числом';
    }

    if (pr.protocol_bonus !== undefined && (typeof pr.protocol_bonus !== 'number' || !Number.isFinite(pr.protocol_bonus))) {
      return 'Баллы протокола должны быть числом';
    }

    if (pr.penalty_points !== undefined && (typeof pr.penalty_points !== 'number' || !Number.isFinite(pr.penalty_points) || pr.penalty_points < 0)) {
      return 'Штрафные баллы должны быть конечным неотрицательным числом';
    }

    if (pr.removal_reason && !['4th_foul', '2nd_tech', 'direct'].includes(pr.removal_reason)) {
      return 'Указана неверная причина удаления';
    }
    if (pr.removal_reason === '4th_foul' && (pr.exit_type !== 'removed' || pr.regular_fouls !== 4)) {
      return 'Причина 4th_foul требует 4 обычных фола и статус removed';
    }
    if (pr.removal_reason === '2nd_tech' && (pr.exit_type !== 'removed' || (pr.minor_technical_fouls || 0) + (pr.major_technical_fouls || 0) < 2)) {
      return 'Причина 2nd_tech требует статус removed и 2 техфола';
    }
    if (pr.removal_reason === 'direct' && pr.exit_type !== 'removed') {
      return 'Причина direct требует статус removed';
    }


    if (pr.ci_points !== undefined && pr.ci_points !== null) {
      if (typeof pr.ci_points !== 'number' || !Number.isFinite(pr.ci_points)) {
        return 'Баллы Ci должны быть числом';
      }
      if (pr.ci_points !== 0 && pr.participant_id !== firstKilledParticipantId) {
        return 'Ci баллы разрешены только для первоубиенного игрока';
      }
    }

    if (pr.color_protocol !== undefined && pr.color_protocol !== null) {
      if (!Array.isArray(pr.color_protocol)) {
        return 'Цветовой протокол должен быть массивом';
      }
      if (pr.color_protocol.length > 0 && pr.exit_type !== 'killed') {
        return 'Цветовой протокол разрешён только для убитого игрока';
      }
      for (const entry of pr.color_protocol) {
        if (!entry || !VALID_COLOR_MARKS.includes(entry.mark)) {
          return 'Цветовой протокол содержит недопустимую метку';
        }
        if (entry.seat_numbers !== undefined && entry.seat_numbers !== null) {
          if (!Array.isArray(entry.seat_numbers)) {
            return 'Номера мест в цветовом протоколе должны быть массивом';
          }
          const seenSeats = new Set<number>();
          for (const sn of entry.seat_numbers) {
            const num = Number(sn);
            if (!Number.isInteger(num) || num < 1 || num > 10) {
              return 'Номера мест в цветовом протоколе должны быть от 1 до 10';
            }
            if (seenSeats.has(num)) {
              return 'Номера мест в цветовом протоколе не могут повторяться';
            }
            seenSeats.add(num);
          }
        }
      }
    }
  }

  if (seenParticipantIds.size !== 10) {
    return 'Результаты должны содержать ровно 10 уникальных участников';
  }

  return null;
}

function validateShots(shots: any): string | null {
  if (shots === undefined || shots === null) return null;
  if (!Array.isArray(shots)) {
    return 'Ночной журнал (shots) должен быть массивом';
  }

  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (!s || typeof s !== 'object') {
      return 'Неверный формат записи в ночном журнале';
    }

    if (s.night_number === undefined || s.night_number === null) {
      return 'Номер ночи обязателен';
    }
    const nn = Number(s.night_number);
    if (!Number.isInteger(nn) || nn <= 0) {
      return 'Номер ночи должен быть положительным целым числом';
    }
    if (nn !== i + 1) {
      return 'Номера ночей должны идти подряд от 1 до N и не повторяться';
    }

    const ts = Number(s.target_seat);
    if (!Number.isInteger(ts) || ts < 1 || ts > 10) {
      return 'Номер цели должен быть целым числом от 1 до 10';
    }

    if (!['killed', 'miss', 'agreement_failed'].includes(s.result)) {
      return 'Недопустимый результат стрельбы. Возможные значения: killed, miss, agreement_failed';
    }
  }

  return null;
}

function validateVotes(votes: any, isComplete: boolean = false): string | null {
  if (votes === undefined || votes === null) return null;
  if (!Array.isArray(votes)) {
    return 'Протокол голосований должен быть массивом';
  }

  const seenRounds = new Set<number>();

  for (const r of votes) {
    if (!r || typeof r !== 'object') {
      return 'Неверный формат круга голосования';
    }

    if (r.round_number === undefined || r.round_number === null) {
      return 'Номер круга голосования обязателен';
    }
    const rn = Number(r.round_number);
    if (!Number.isInteger(rn) || rn <= 0) {
      return 'Номер круга голосования должен быть положительным целым числом';
    }
    if (seenRounds.has(rn)) {
      return 'Номера кругов голосования не могут повторяться';
    }
    seenRounds.add(rn);

    if (typeof r.is_revote !== 'boolean') {
      return 'Поле переголосования (is_revote) должно быть булевым значением';
    }

    if (!Array.isArray(r.nominated_seats)) {
      return 'Выставленные игроки в круге голосования должны быть массивом';
    }

    if (typeof r.vote_counts !== 'object' || r.vote_counts === null || Array.isArray(r.vote_counts)) {
      return 'Счётчик голосов должен быть объектом';
    }

    if (r.nominated_seats.length === 0) {
      if (isComplete) {
        return 'Запрещено завершать протокол с пустым кругом голосования';
      }
      if (Object.keys(r.vote_counts).length !== 0) {
        return 'Пустой круг разрешён только как nominated_seats: [] и vote_counts: {}';
      }
      continue;
    }

    const nominatedSet = new Set<number>();
    for (const seat of r.nominated_seats) {
      const num = Number(seat);
      if (!Number.isInteger(num) || num < 1 || num > 10) {
        return 'Номера кандидатов должны быть целыми числами от 1 до 10';
      }
      if (nominatedSet.has(num)) {
        return 'Кандидаты на голосование не могут повторяться в одном круге';
      }
      nominatedSet.add(num);
    }

    for (const seat of nominatedSet) {
      if (r.vote_counts[seat] === undefined && r.vote_counts[String(seat)] === undefined) {
        return `Каждый кандидат голосования обязан иметь запись в vote_counts (отсутствует место ${seat})`;
      }
    }

    for (const [key, val] of Object.entries(r.vote_counts)) {
      const seatKey = Number(key);
      if (!Number.isInteger(seatKey) || seatKey < 1 || seatKey > 10 || !nominatedSet.has(seatKey)) {
        return 'Лишние кандидаты в vote_counts запрещены';
      }

      const count = Number(val);
      if (!Number.isInteger(count) || count < 0 || count > 10) {
        return 'Количество голосов должно быть целым числом от 0 до 10';
      }
    }
  }
  return null;
}

// 1. GET /api/tournaments/:tournamentId/games/:gameId/protocol
router.get('/:tournamentId/games/:gameId/protocol', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId, gameId } = req.params;

  try {
    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const seats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id, p.nickname as original_nickname
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
      JOIN players p ON p.id = tp.player_id
      WHERE tgs.game_id = ?
      ORDER BY tgs.seat_number ASC
    `, [gameId]);

    const protocolRecord = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    const playerResultsRecords = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [gameId]);

    const resultsMap = new Map<string, any>();
    for (const pr of playerResultsRecords) {
      resultsMap.set(pr.participant_id, pr);
    }

    const playerResults = seats.map((seat) => {
      const existing = resultsMap.get(seat.participant_id);
      let colorProto = [];
      if (existing?.color_protocol_json) {
        try {
          colorProto = JSON.parse(existing.color_protocol_json);
        } catch (_) {}
      }

      return {
        id: existing?.id,
        game_id: gameId,
        participant_id: seat.participant_id,
        seat_number: seat.seat_number,
        display_name: seat.display_name,
        player_id: seat.player_id,
        role: seat.role,
        exit_type: existing?.exit_type || 'alive',
        exit_order: existing?.exit_order ?? null,
        regular_fouls: existing?.regular_fouls ?? 0,
        minor_technical_fouls: existing?.minor_technical_fouls ?? 0,
        major_technical_fouls: existing?.major_technical_fouls ?? 0,
        technical_fouls: existing?.technical_fouls ?? 0,
        judge_bonus: existing?.judge_bonus ?? 0,
        protocol_bonus: existing?.protocol_bonus ?? 0,
        penalty_points: existing?.penalty_points ?? 0,
        disciplinary_penalty_points: existing?.disciplinary_penalty_points ?? 0,
        removal_reason: existing?.removal_reason || null,
        ci_points: existing?.ci_points ?? 0,
        color_protocol: colorProto,
        notes: existing?.notes || null,
      };
    });

    let protocolData: any = null;

    if (protocolRecord) {
      let bestMoveSeats = [];
      let votes = [];
      let shots = [];
      let replacement = null;

      try { bestMoveSeats = JSON.parse(protocolRecord.best_move_seats_json || '[]'); } catch (_) {}
      try { votes = JSON.parse(protocolRecord.votes_json || '[]'); } catch (_) {}
      try { shots = JSON.parse(protocolRecord.shots_json || '[]'); } catch (_) {}
      if (protocolRecord.replacement_json) {
        try { replacement = JSON.parse(protocolRecord.replacement_json); } catch (_) {}
      }

      const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, seats);

      const bmRecords = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
      let best_moves: any[] = [];

      if (bmRecords.length > 0) {
        best_moves = bmRecords.map(bm => {
          let bmSeats = [];
          try { bmSeats = JSON.parse(bm.seat_numbers_json || '[]'); } catch (_) {}
          const { guessedBlacks, bonusPoints } = calculateBestMovePoints(bmSeats, seats);
          return {
            participant_id: bm.participant_id,
            source: bm.source,
            seat_numbers: bmSeats,
            guessed_blacks: guessedBlacks,
            bonus_points: bonusPoints
          };
        });
      } else if (protocolRecord.best_move_participant_id) {
        const { guessedBlacks, bonusPoints } = calculateBestMovePoints(bestMoveSeats, seats);
        best_moves.push({
          participant_id: protocolRecord.best_move_participant_id,
          source: protocolRecord.best_move_source || 'first_killed',
          seat_numbers: bestMoveSeats,
          guessed_blacks: guessedBlacks,
          bonus_points: bonusPoints
        });
      }

      protocolData = {
        id: protocolRecord.id,
        game_id: gameId,
        status: protocolRecord.status,
        winner_team: protocolRecord.winner_team,
        end_reason: protocolRecord.end_reason,
        ppk_culprit_participant_id: protocolRecord.ppk_culprit_participant_id,
        first_killed_participant_id: protocolRecord.first_killed_participant_id,
        zero_round_voted_participant_id: protocolRecord.zero_round_voted_participant_id,
        best_move_participant_id: protocolRecord.best_move_participant_id,
        best_move_source: protocolRecord.best_move_source,
        best_move_seats: bestMoveSeats,
        best_moves,
        votes,
        shots,
        replacement,
        judge_notes: protocolRecord.judge_notes,
        created_at: protocolRecord.created_at,
        updated_at: protocolRecord.updated_at,
        completed_at: protocolRecord.completed_at,
        best_move_score,
      };
    } else {
      protocolData = {
        game_id: gameId,
        status: 'draft',
        winner_team: game.winner_team || null,
        first_killed_participant_id: null,
        zero_round_voted_participant_id: null,
        best_move_participant_id: null,
        best_move_source: null,
        best_move_seats: [],
        best_moves: [],
        votes: [],
        shots: [],
        replacement: null,
        judge_notes: null,
        best_move_score: 0,
      };
    }

    res.json({
      protocol: protocolData,
      player_results: playerResults,
      game: { ...game, seats },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка получения протокола' });
  }
});

// 2. PUT /api/tournaments/:tournamentId/games/:gameId/protocol
router.put('/:tournamentId/games/:gameId/protocol', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId, gameId } = req.params;
  const { protocol, player_results } = req.body;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status === 'completed') {
      return res.status(400).json({ error: 'Завершённый турнир нельзя редактировать' });
    }

    if (tournament.status !== 'active') {
      return res.status(400).json({ error: 'Сохранить протокол можно только в активном турнире' });
    }

    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    if (game.status === 'planned') {
      return res.status(400).json({ error: 'Нельзя сохранить запланированную игру. Сначала запустите игру' });
    }

    const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [gameId]);
    const allParticipantIds = seats.map((s) => s.participant_id);

    const existingProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    if ((existingProtocol && existingProtocol.status === 'completed') || game.status === 'completed') {
      return res.status(400).json({ error: 'Завершённую игру нельзя редактировать без возврата в черновик' });
    }

    // Validations
    if (protocol?.end_reason === 'ppk') {
      if (!protocol.ppk_culprit_participant_id) {
        return res.status(400).json({ error: 'При ППК виновник обязателен' });
      }
      const culprit = seats.find((s: any) => s.participant_id === protocol.ppk_culprit_participant_id);
      if (!culprit) {
        return res.status(400).json({ error: 'Виновник ППК не участвует в игре' });
      }
      // Automate winner assignment for ppk
      const culpritRole = ['мафия', 'mafia', 'black', 'черный', 'дон', 'don'].includes((culprit.role || '').toLowerCase()) ? 'black' : 'red';
      protocol.winner_team = culpritRole === 'red' ? 'black' : 'red';
    }

    if (protocol?.end_reason && !['normal', 'ppk'].includes(protocol.end_reason)) {
      return res.status(400).json({ error: 'Неверная причина завершения (end_reason)' });
    }
    if (protocol?.end_reason === 'normal' && protocol?.ppk_culprit_participant_id) {
      return res.status(400).json({ error: 'При обычном завершении виновник ППК должен быть null' });
    }

    if (player_results && Array.isArray(player_results)) {
      player_results.forEach(pr => {
        pr.technical_fouls = (pr.minor_technical_fouls || 0) + (pr.major_technical_fouls || 0);
        pr.disciplinary_penalty_points = calculateDisciplinaryPenalty(
          pr.minor_technical_fouls || 0,
          pr.major_technical_fouls || 0,
          pr.exit_type === 'removed',
          protocol?.end_reason === 'ppk' && protocol?.ppk_culprit_participant_id === pr.participant_id
        );
      });
    }

    if (!player_results || !Array.isArray(player_results)) {
      return res.status(400).json({ error: 'Результаты участников (player_results) обязательны и должны быть массивом' });
    }
    const playerErr = validatePlayerResults(player_results, seats, protocol?.first_killed_participant_id);
    if (playerErr) {
      return res.status(400).json({ error: playerErr });
    }

    const votesErr = validateVotes(protocol?.votes, false);
    if (votesErr) {
      return res.status(400).json({ error: votesErr });
    }

    const shotsErr = validateShots(protocol?.shots);
    if (shotsErr) {
      return res.status(400).json({ error: shotsErr });
    }

    let bestMoves = protocol?.best_moves;
    if (bestMoves === undefined && protocol?.best_move_participant_id) {
      bestMoves = [{
        participant_id: protocol.best_move_participant_id,
        source: protocol.best_move_participant_id === protocol.first_killed_participant_id ? 'first_killed' : 'zero_round_voted',
        seat_numbers: protocol.best_move_seats || []
      }];
    }
    if (!bestMoves) bestMoves = [];

    const bestMoveErr = validateBestMoves(
      bestMoves,
      protocol?.first_killed_participant_id,
      protocol?.zero_round_voted_participant_id,
      allParticipantIds,
      player_results
    );
    if (bestMoveErr) {
      return res.status(400).json({ error: bestMoveErr });
    }

    const fkErr = validateFirstKilled(
      protocol?.first_killed_participant_id,
      seats,
      player_results,
      protocol?.shots
    );
    if (fkErr) {
      return res.status(400).json({ error: fkErr });
    }

    const now = new Date().toISOString();
    const protocolId = existingProtocol?.id || crypto.randomUUID();

    await db.transaction(async (tx) => {
      // Delete old protocol if exists and insert
      await tx.run('DELETE FROM tournament_game_protocols WHERE game_id = ?', [gameId]);

      await tx.run(
        `INSERT INTO tournament_game_protocols (
          id, game_id, status, winner_team,
          first_killed_participant_id, zero_round_voted_participant_id,
          best_move_participant_id, best_move_source, best_move_seats_json,
          votes_json, shots_json, replacement_json, judge_notes, end_reason, ppk_culprit_participant_id,
          created_at, updated_at, completed_at
        ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          protocolId,
          gameId,
          protocol?.winner_team || null,
          protocol?.first_killed_participant_id || null,
          protocol?.zero_round_voted_participant_id || null,
          null, // deprecated
          null, // deprecated
          '[]', // deprecated
          JSON.stringify(protocol?.votes || []),
          JSON.stringify(protocol?.shots || []),
          protocol?.replacement ? JSON.stringify(protocol.replacement) : null,
          protocol?.judge_notes || null,
          protocol?.end_reason || 'normal',
          protocol?.ppk_culprit_participant_id || null,
          existingProtocol?.created_at || now,
          now,
        ]
      );

      await tx.run('DELETE FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
      for (const bm of bestMoves) {
        await tx.run(
          `INSERT INTO tournament_game_best_moves (id, game_id, participant_id, source, seat_numbers_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), gameId, bm.participant_id, bm.source, JSON.stringify(bm.seat_numbers || []), now, now]
        );
      }

      // Save player results
      if (Array.isArray(player_results)) {
        await tx.run('DELETE FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
        for (const pr of player_results) {
          const resId = crypto.randomUUID();
          await tx.run(
            `INSERT INTO tournament_game_player_results (
              id, game_id, participant_id, exit_type, exit_order,
              regular_fouls, minor_technical_fouls, major_technical_fouls, technical_fouls, judge_bonus, protocol_bonus, penalty_points, disciplinary_penalty_points, removal_reason, ci_points,
              color_protocol_json, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              resId,
              gameId,
              pr.participant_id,
              pr.exit_type || 'alive',
              pr.exit_order ?? null,
              pr.regular_fouls ?? 0,
              pr.minor_technical_fouls ?? 0,
              pr.major_technical_fouls ?? 0,
              pr.technical_fouls ?? 0,
              pr.judge_bonus ?? 0,
              pr.protocol_bonus ?? 0,
              pr.penalty_points ?? 0,
              pr.disciplinary_penalty_points ?? 0,
              pr.removal_reason || null,
              0,
              JSON.stringify(pr.color_protocol || []),
              pr.notes || null,
            ]
          );
        }
      }

      // Update winner team on game if provided
      if (protocol?.winner_team) {
        await tx.run('UPDATE tournament_games SET winner_team = ? WHERE id = ?', [protocol.winner_team, gameId]);
      }
    });

    // Fetch and return saved protocol
    const savedProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    const savedResultsRecords = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [gameId]);

    const resultsMap = new Map<string, any>();
    for (const pr of savedResultsRecords) {
      resultsMap.set(pr.participant_id, pr);
    }

    const fullSeats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id, p.nickname as original_nickname
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
      JOIN players p ON p.id = tp.player_id
      WHERE tgs.game_id = ?
      ORDER BY tgs.seat_number ASC
    `, [gameId]);

    const playerResultsList = fullSeats.map((seat) => {
      const existing = resultsMap.get(seat.participant_id);
      let colorProto = [];
      if (existing?.color_protocol_json) {
        try { colorProto = JSON.parse(existing.color_protocol_json); } catch (_) {}
      }
      return {
        id: existing?.id,
        game_id: gameId,
        participant_id: seat.participant_id,
        seat_number: seat.seat_number,
        display_name: seat.display_name,
        player_id: seat.player_id,
        role: seat.role,
        exit_type: existing?.exit_type || 'alive',
        exit_order: existing?.exit_order ?? null,
        regular_fouls: existing?.regular_fouls ?? 0,
        minor_technical_fouls: existing?.minor_technical_fouls ?? 0,
        major_technical_fouls: existing?.major_technical_fouls ?? 0,
        technical_fouls: existing?.technical_fouls ?? 0,
        judge_bonus: existing?.judge_bonus ?? 0,
        protocol_bonus: existing?.protocol_bonus ?? 0,
        penalty_points: existing?.penalty_points ?? 0,
        disciplinary_penalty_points: existing?.disciplinary_penalty_points ?? 0,
        removal_reason: existing?.removal_reason || null,
        ci_points: existing?.ci_points ?? 0,
        color_protocol: colorProto,
        notes: existing?.notes || null,
      };
    });

    let bestMoveSeats = [];
    try { bestMoveSeats = JSON.parse(savedProtocol.best_move_seats_json || '[]'); } catch (_) {}
    const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

    const bmRecords = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
    const responseBestMoves = bmRecords.map(bm => {
      let bmSeats = [];
      try { bmSeats = JSON.parse(bm.seat_numbers_json || '[]'); } catch (_) {}
      const { guessedBlacks, bonusPoints } = calculateBestMovePoints(bmSeats, fullSeats);
      return {
        participant_id: bm.participant_id,
        source: bm.source,
        seat_numbers: bmSeats,
        guessed_blacks: guessedBlacks,
        bonus_points: bonusPoints
      };
    });

    res.json({
      protocol: {
        id: savedProtocol.id,
        game_id: gameId,
        status: savedProtocol.status,
        winner_team: savedProtocol.winner_team,
        first_killed_participant_id: savedProtocol.first_killed_participant_id,
        zero_round_voted_participant_id: savedProtocol.zero_round_voted_participant_id,
        best_move_participant_id: savedProtocol.best_move_participant_id,
        best_move_source: savedProtocol.best_move_source,
        best_move_seats: bestMoveSeats,
        best_moves: responseBestMoves,
        votes: JSON.parse(savedProtocol.votes_json || '[]'),
        shots: JSON.parse(savedProtocol.shots_json || '[]'),
        replacement: savedProtocol.replacement_json ? JSON.parse(savedProtocol.replacement_json) : null,
        judge_notes: savedProtocol.judge_notes,
        created_at: savedProtocol.created_at,
        updated_at: savedProtocol.updated_at,
        completed_at: savedProtocol.completed_at,
        best_move_score,
      },
      player_results: playerResultsList,
      game,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка сохранения протокола' });
  }
});

// 3. POST /api/tournaments/:tournamentId/games/:gameId/protocol/complete
router.post('/:tournamentId/games/:gameId/protocol/complete', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId, gameId } = req.params;
  const { protocol, player_results } = req.body;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status === 'completed') {
      return res.status(400).json({ error: 'Завершённый турнир нельзя редактировать' });
    }

    if (tournament.status !== 'active') {
      return res.status(400).json({ error: 'Завершить протокол можно только в активном турнире' });
    }

    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    if (game.status === 'planned') {
      return res.status(400).json({ error: 'Нельзя завершить запланированную игру. Сначала запустите игру' });
    }

    const seats = await db.all<any>('SELECT * FROM tournament_game_seats WHERE game_id = ? ORDER BY seat_number ASC', [gameId]);
    const allParticipantIds = seats.map((s) => s.participant_id);

    const existingProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    if (existingProtocol && existingProtocol.status === 'completed') {
      // Already completed, return gracefully
      const savedResultsRecords = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
      const resultsMap = new Map<string, any>();
      for (const pr of savedResultsRecords) {
        resultsMap.set(pr.participant_id, pr);
      }

      const fullSeats = await db.all<any>(`
        SELECT tgs.*, tp.display_name, tp.player_id, p.nickname as original_nickname
        FROM tournament_game_seats tgs
        JOIN tournament_participants tp ON tp.id = tgs.participant_id
        JOIN players p ON p.id = tp.player_id
        WHERE tgs.game_id = ?
        ORDER BY tgs.seat_number ASC
      `, [gameId]);

      const playerResultsList = fullSeats.map((seat) => {
        const existing = resultsMap.get(seat.participant_id);
        let colorProto = [];
        if (existing?.color_protocol_json) {
          try { colorProto = JSON.parse(existing.color_protocol_json); } catch (_) {}
        }
        return {
          id: existing?.id,
          game_id: gameId,
          participant_id: seat.participant_id,
          seat_number: seat.seat_number,
          display_name: seat.display_name,
          player_id: seat.player_id,
          role: seat.role,
          exit_type: existing?.exit_type || 'alive',
          exit_order: existing?.exit_order ?? null,
          regular_fouls: existing?.regular_fouls ?? 0,
          technical_fouls: existing?.technical_fouls ?? 0,
          judge_bonus: existing?.judge_bonus ?? 0,
          protocol_bonus: existing?.protocol_bonus ?? 0,
          penalty_points: existing?.penalty_points ?? 0,
          ci_points: existing?.ci_points ?? 0,
          color_protocol: colorProto,
          notes: existing?.notes || null,
        };
      });

      let bestMoveSeats = [];
      try { bestMoveSeats = JSON.parse(existingProtocol.best_move_seats_json || '[]'); } catch (_) {}
      const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

      const bmRecords1 = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
      const responseBestMoves1 = bmRecords1.map(bm => {
        let bmSeats = [];
        try { bmSeats = JSON.parse(bm.seat_numbers_json || '[]'); } catch (_) {}
        const { guessedBlacks, bonusPoints } = calculateBestMovePoints(bmSeats, fullSeats);
        return {
          participant_id: bm.participant_id,
          source: bm.source,
          seat_numbers: bmSeats,
          guessed_blacks: guessedBlacks,
          bonus_points: bonusPoints
        };
      });

      return res.json({
        protocol: {
          id: existingProtocol.id,
          game_id: gameId,
          status: 'completed',
          winner_team: existingProtocol.winner_team,
          first_killed_participant_id: existingProtocol.first_killed_participant_id,
          zero_round_voted_participant_id: existingProtocol.zero_round_voted_participant_id,
          best_move_participant_id: existingProtocol.best_move_participant_id,
          best_move_source: existingProtocol.best_move_source,
          best_move_seats: bestMoveSeats,
          best_moves: responseBestMoves1,
          votes: JSON.parse(existingProtocol.votes_json || '[]'),
          shots: JSON.parse(existingProtocol.shots_json || '[]'),
          replacement: existingProtocol.replacement_json ? JSON.parse(existingProtocol.replacement_json) : null,
          judge_notes: existingProtocol.judge_notes,
          created_at: existingProtocol.created_at,
          updated_at: existingProtocol.updated_at,
          completed_at: existingProtocol.completed_at,
          best_move_score,
        },
        player_results: playerResultsList,
        game,
      });
    }

    // Completion Validations
    if (protocol?.end_reason === 'ppk') {
      if (!protocol.ppk_culprit_participant_id) {
        return res.status(400).json({ error: 'При ППК виновник обязателен' });
      }
      const culprit = seats.find((s: any) => s.participant_id === protocol.ppk_culprit_participant_id);
      if (!culprit) {
        return res.status(400).json({ error: 'Виновник ППК не участвует в игре' });
      }
      // Automate winner assignment for ppk
      const culpritRole = normalizeRole(culprit.role);
      if (culpritRole === 'citizen' || culpritRole === 'sheriff') {
        
        protocol.winner_team = 'black';
      } else if (culpritRole === 'mafia' || culpritRole === 'don') {
        
        protocol.winner_team = 'red';
      }
    }

    if (!protocol?.winner_team || !['red', 'black'].includes(protocol.winner_team)) {
      return res.status(400).json({ error: 'Необходимо выбрать победившую команду (Красные или Чёрные)' });
    }

    // Check roles distribution
    const roleCounts: Record<string, number> = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
    for (const seat of seats) {
      const r = normalizeRole(seat.role);
      if (r && roleCounts[r] !== undefined) roleCounts[r]++;
    }
    if (roleCounts.citizen !== 6 || roleCounts.sheriff !== 1 || roleCounts.mafia !== 2 || roleCounts.don !== 1) {
      return res.status(400).json({ error: 'Не все роли участников корректно распределены (требуется: 6 мирных, 1 Шериф, 2 Мафии, 1 Дон)' });
    }

    if (protocol?.end_reason && !['normal', 'ppk'].includes(protocol.end_reason)) {
      return res.status(400).json({ error: 'Неверная причина завершения (end_reason)' });
    }
    if (protocol?.end_reason === 'normal' && protocol?.ppk_culprit_participant_id) {
      return res.status(400).json({ error: 'При обычном завершении виновник ППК должен быть null' });
    }

    if (player_results && Array.isArray(player_results)) {
      player_results.forEach(pr => {
        pr.technical_fouls = (pr.minor_technical_fouls || 0) + (pr.major_technical_fouls || 0);
        pr.disciplinary_penalty_points = calculateDisciplinaryPenalty(
          pr.minor_technical_fouls || 0,
          pr.major_technical_fouls || 0,
          pr.exit_type === 'removed',
          protocol?.end_reason === 'ppk' && protocol?.ppk_culprit_participant_id === pr.participant_id
        );
      });
    }

    if (!player_results || !Array.isArray(player_results)) {
      return res.status(400).json({ error: 'Результаты участников (player_results) обязательны и должны быть массивом' });
    }
    const playerErr = validatePlayerResults(player_results, seats, protocol?.first_killed_participant_id);
    if (playerErr) {
      return res.status(400).json({ error: playerErr });
    }

    const votesErr = validateVotes(protocol?.votes, true);
    if (votesErr) {
      return res.status(400).json({ error: votesErr });
    }

    const shotsErr = validateShots(protocol?.shots);
    if (shotsErr) {
      return res.status(400).json({ error: shotsErr });
    }

    let bestMoves = protocol?.best_moves;
    if (bestMoves === undefined && protocol?.best_move_participant_id) {
      bestMoves = [{
        participant_id: protocol.best_move_participant_id,
        source: protocol.best_move_participant_id === protocol.first_killed_participant_id ? 'first_killed' : 'zero_round_voted',
        seat_numbers: protocol.best_move_seats || []
      }];
    }
    if (!bestMoves) bestMoves = [];

    const bestMoveErr = validateBestMoves(
      bestMoves,
      protocol?.first_killed_participant_id,
      protocol?.zero_round_voted_participant_id,
      allParticipantIds,
      player_results
    );
    if (bestMoveErr) {
      return res.status(400).json({ error: bestMoveErr });
    }

    const fkErr = validateFirstKilled(
      protocol?.first_killed_participant_id,
      seats,
      player_results,
      protocol?.shots
    );
    if (fkErr) {
      return res.status(400).json({ error: fkErr });
    }

    const now = new Date().toISOString();
    const protocolId = existingProtocol?.id || crypto.randomUUID();

    await db.transaction(async (tx) => {
      // Delete old protocol if exists and insert
      await tx.run('DELETE FROM tournament_game_protocols WHERE game_id = ?', [gameId]);

      await tx.run(
        `INSERT INTO tournament_game_protocols (
          id, game_id, status, winner_team,
          first_killed_participant_id, zero_round_voted_participant_id,
          best_move_participant_id, best_move_source, best_move_seats_json,
          votes_json, shots_json, replacement_json, judge_notes, end_reason, ppk_culprit_participant_id,
          created_at, updated_at, completed_at
        ) VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          protocolId,
          gameId,
          protocol.winner_team,
          protocol?.first_killed_participant_id || null,
          protocol?.zero_round_voted_participant_id || null,
          null, // deprecated
          null, // deprecated
          '[]', // deprecated
          JSON.stringify(protocol?.votes || []),
          JSON.stringify(protocol?.shots || []),
          protocol?.replacement ? JSON.stringify(protocol.replacement) : null,
          protocol?.judge_notes || null,
          protocol?.end_reason || 'normal',
          protocol?.ppk_culprit_participant_id || null,
          existingProtocol?.created_at || now,
          now,
          now,
        ]
      );

      await tx.run('DELETE FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
      for (const bm of bestMoves) {
        await tx.run(
          `INSERT INTO tournament_game_best_moves (id, game_id, participant_id, source, seat_numbers_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), gameId, bm.participant_id, bm.source, JSON.stringify(bm.seat_numbers || []), now, now]
        );
      }

      // Save player results
      if (Array.isArray(player_results)) {
        await tx.run('DELETE FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
        for (const pr of player_results) {
          const resId = crypto.randomUUID();
          await tx.run(
            `INSERT INTO tournament_game_player_results (
              id, game_id, participant_id, exit_type, exit_order,
              regular_fouls, minor_technical_fouls, major_technical_fouls, technical_fouls, judge_bonus, protocol_bonus, penalty_points, disciplinary_penalty_points, removal_reason, ci_points,
              color_protocol_json, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              resId,
              gameId,
              pr.participant_id,
              pr.exit_type || 'alive',
              pr.exit_order ?? null,
              pr.regular_fouls ?? 0,
              pr.minor_technical_fouls ?? 0,
              pr.major_technical_fouls ?? 0,
              pr.technical_fouls ?? 0,
              pr.judge_bonus ?? 0,
              pr.protocol_bonus ?? 0,
              pr.penalty_points ?? 0,
              pr.disciplinary_penalty_points ?? 0,
              pr.removal_reason || null,
              0,
              JSON.stringify(pr.color_protocol || []),
              pr.notes || null,
            ]
          );
        }
      }

      // Update tournament_games status to completed
      await tx.run(
        "UPDATE tournament_games SET status = 'completed', winner_team = ?, completed_at = ? WHERE id = ?",
        [protocol.winner_team, now, gameId]
      );
    });

    // Fetch and return completed protocol
    const savedProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    const savedResultsRecords = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
    const updatedGame = await db.get<any>('SELECT * FROM tournament_games WHERE id = ?', [gameId]);

    const resultsMap = new Map<string, any>();
    for (const pr of savedResultsRecords) {
      resultsMap.set(pr.participant_id, pr);
    }

    const fullSeats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id, p.nickname as original_nickname
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
      JOIN players p ON p.id = tp.player_id
      WHERE tgs.game_id = ?
      ORDER BY tgs.seat_number ASC
    `, [gameId]);

    const playerResultsList = fullSeats.map((seat) => {
      const existing = resultsMap.get(seat.participant_id);
      let colorProto = [];
      if (existing?.color_protocol_json) {
        try { colorProto = JSON.parse(existing.color_protocol_json); } catch (_) {}
      }
      return {
        id: existing?.id,
        game_id: gameId,
        participant_id: seat.participant_id,
        seat_number: seat.seat_number,
        display_name: seat.display_name,
        player_id: seat.player_id,
        role: seat.role,
        exit_type: existing?.exit_type || 'alive',
        exit_order: existing?.exit_order ?? null,
        regular_fouls: existing?.regular_fouls ?? 0,
        minor_technical_fouls: existing?.minor_technical_fouls ?? 0,
        major_technical_fouls: existing?.major_technical_fouls ?? 0,
        technical_fouls: existing?.technical_fouls ?? 0,
        judge_bonus: existing?.judge_bonus ?? 0,
        protocol_bonus: existing?.protocol_bonus ?? 0,
        penalty_points: existing?.penalty_points ?? 0,
        disciplinary_penalty_points: existing?.disciplinary_penalty_points ?? 0,
        removal_reason: existing?.removal_reason || null,
        ci_points: existing?.ci_points ?? 0,
        color_protocol: colorProto,
        notes: existing?.notes || null,
      };
    });

    let bestMoveSeats = [];
    try { bestMoveSeats = JSON.parse(savedProtocol.best_move_seats_json || '[]'); } catch (_) {}
    const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

    const bmRecords2 = await db.all<any>('SELECT * FROM tournament_game_best_moves WHERE game_id = ?', [gameId]);
    const responseBestMoves2 = bmRecords2.map(bm => {
      let bmSeats = [];
      try { bmSeats = JSON.parse(bm.seat_numbers_json || '[]'); } catch (_) {}
      const { guessedBlacks, bonusPoints } = calculateBestMovePoints(bmSeats, fullSeats);
      return {
        participant_id: bm.participant_id,
        source: bm.source,
        seat_numbers: bmSeats,
        guessed_blacks: guessedBlacks,
        bonus_points: bonusPoints
      };
    });

    res.json({
      protocol: {
        id: savedProtocol.id,
        game_id: gameId,
        status: savedProtocol.status,
        winner_team: savedProtocol.winner_team,
        first_killed_participant_id: savedProtocol.first_killed_participant_id,
        zero_round_voted_participant_id: savedProtocol.zero_round_voted_participant_id,
        best_move_participant_id: savedProtocol.best_move_participant_id,
        best_move_source: savedProtocol.best_move_source,
        best_move_seats: bestMoveSeats,
        best_moves: responseBestMoves2,
        votes: JSON.parse(savedProtocol.votes_json || '[]'),
        shots: JSON.parse(savedProtocol.shots_json || '[]'),
        replacement: savedProtocol.replacement_json ? JSON.parse(savedProtocol.replacement_json) : null,
        judge_notes: savedProtocol.judge_notes,
        created_at: savedProtocol.created_at,
        updated_at: savedProtocol.updated_at,
        completed_at: savedProtocol.completed_at,
        best_move_score,
      },
      player_results: playerResultsList,
      game: updatedGame,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка завершения протокола' });
  }
});

// 4. POST /api/tournaments/:tournamentId/games/:gameId/protocol/revert-to-draft
router.post('/:tournamentId/games/:gameId/protocol/revert-to-draft', requireOrganizerAuth, async (req: AuthenticatedRequest, res: Response) => {
  const db = (req as any).db as DatabaseWrapper;
  const { tournamentId, gameId } = req.params;

  try {
    const tournament = await db.get<any>('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
    if (!tournament) {
      return res.status(404).json({ error: 'Турнир не найден' });
    }

    if (tournament.status === 'completed') {
      return res.status(400).json({ error: 'Завершённый турнир нельзя редактировать' });
    }

    if (tournament.status !== 'active') {
      return res.status(400).json({ error: 'Вернуть игру в черновик можно только в активном турнире' });
    }

    const game = await db.get<any>('SELECT * FROM tournament_games WHERE id = ? AND tournament_id = ?', [gameId, tournamentId]);
    if (!game) {
      return res.status(404).json({ error: 'Игра не найдена' });
    }

    const activeGame = await db.get<any>(
      "SELECT id FROM tournament_games WHERE tournament_id = ? AND status = 'active' AND id != ?",
      [tournamentId, gameId]
    );
    if (activeGame) {
      return res.status(400).json({ error: 'Нельзя вернуть игру в черновик, так как в турнире уже есть другая активная игра' });
    }

    const existingProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    if (!existingProtocol) {
      return res.status(400).json({ error: 'Протокол не найден' });
    }

    const now = new Date().toISOString();

    await db.transaction(async (tx) => {
      await tx.run(
        "UPDATE tournament_game_protocols SET status = 'draft', completed_at = NULL, updated_at = ? WHERE id = ?",
        [now, existingProtocol.id]
      );
      await tx.run(
        "UPDATE tournament_games SET status = 'active', completed_at = NULL WHERE id = ?",
        [gameId]
      );
    });

    const savedProtocol = await db.get<any>('SELECT * FROM tournament_game_protocols WHERE game_id = ?', [gameId]);
    const savedResultsRecords = await db.all<any>('SELECT * FROM tournament_game_player_results WHERE game_id = ?', [gameId]);
    const updatedGame = await db.get<any>('SELECT * FROM tournament_games WHERE id = ?', [gameId]);

    const resultsMap = new Map<string, any>();
    for (const pr of savedResultsRecords) {
      resultsMap.set(pr.participant_id, pr);
    }

    const fullSeats = await db.all<any>(`
      SELECT tgs.*, tp.display_name, tp.player_id, p.nickname as original_nickname
      FROM tournament_game_seats tgs
      JOIN tournament_participants tp ON tp.id = tgs.participant_id
      JOIN players p ON p.id = tp.player_id
      WHERE tgs.game_id = ?
      ORDER BY tgs.seat_number ASC
    `, [gameId]);

    const playerResultsList = fullSeats.map((seat) => {
      const existing = resultsMap.get(seat.participant_id);
      let colorProto = [];
      if (existing?.color_protocol_json) {
        try { colorProto = JSON.parse(existing.color_protocol_json); } catch (_) {}
      }
      return {
        id: existing?.id,
        game_id: gameId,
        participant_id: seat.participant_id,
        seat_number: seat.seat_number,
        display_name: seat.display_name,
        player_id: seat.player_id,
        role: seat.role,
        exit_type: existing?.exit_type || 'alive',
        exit_order: existing?.exit_order ?? null,
        regular_fouls: existing?.regular_fouls ?? 0,
        minor_technical_fouls: existing?.minor_technical_fouls ?? 0,
        major_technical_fouls: existing?.major_technical_fouls ?? 0,
        technical_fouls: existing?.technical_fouls ?? 0,
        judge_bonus: existing?.judge_bonus ?? 0,
        protocol_bonus: existing?.protocol_bonus ?? 0,
        penalty_points: existing?.penalty_points ?? 0,
        disciplinary_penalty_points: existing?.disciplinary_penalty_points ?? 0,
        removal_reason: existing?.removal_reason || null,
        ci_points: existing?.ci_points ?? 0,
        color_protocol: colorProto,
        notes: existing?.notes || null,
      };
    });

    let bestMoveSeats = [];
    try { bestMoveSeats = JSON.parse(savedProtocol.best_move_seats_json || '[]'); } catch (_) {}
    const { bonusPoints: best_move_score } = calculateBestMovePoints(bestMoveSeats, fullSeats);

    res.json({
      protocol: {
        id: savedProtocol.id,
        game_id: gameId,
        status: savedProtocol.status,
        winner_team: savedProtocol.winner_team,
        first_killed_participant_id: savedProtocol.first_killed_participant_id,
        zero_round_voted_participant_id: savedProtocol.zero_round_voted_participant_id,
        best_move_participant_id: savedProtocol.best_move_participant_id,
        best_move_source: savedProtocol.best_move_source,
        best_move_seats: bestMoveSeats,
        votes: JSON.parse(savedProtocol.votes_json || '[]'),
        shots: JSON.parse(savedProtocol.shots_json || '[]'),
        replacement: savedProtocol.replacement_json ? JSON.parse(savedProtocol.replacement_json) : null,
        judge_notes: savedProtocol.judge_notes,
        created_at: savedProtocol.created_at,
        updated_at: savedProtocol.updated_at,
        completed_at: savedProtocol.completed_at,
        best_move_score,
      },
      player_results: playerResultsList,
      game: updatedGame,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка возврата в черновик' });
  }
});

export default router;
