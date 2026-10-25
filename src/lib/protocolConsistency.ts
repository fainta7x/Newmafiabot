import { normalizeGameRole } from '../shared/gameRoles.ts';
import { isGameExitType, isRemovalReason } from '../shared/gameExit.ts';

/** Canonical player/discipline, night and marker checks; tournaments default to ten, novice games retain eight or nine. */
const VALID_COLOR_MARKS = ['red', 'black', 'sheriff'];

/**
 * A player who already left the game (killed, voted out) may later be removed by the judge; he then shows as
 * «removed» with a removal reason, and everything recorded before (first killed, ЛХ, death protocol) stays
 * (owner decision, 2026-10-04).
 */
export const leftAs = (pr: any, expected: 'killed' | 'voted_zero_round' | 'voted_day'): boolean =>
  pr?.exit_type === expected || (pr?.exit_type === 'removed' && Boolean(pr?.removal_reason));

export function validateFirstKilled(
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

  const normRole = normalizeGameRole(fkSeat.role);
  if (!normRole) {
    return `У первоубиенного игрока должна быть указана роль (сейчас: ${fkSeat.role || 'не указана'})`;
  }

  if (playerResults && Array.isArray(playerResults)) {
    const fkResult = playerResults.find((pr) => pr.participant_id === firstKilledParticipantId);
    if (fkResult && !leftAs(fkResult, 'killed')) {
      return 'Первоубиенный игрок должен иметь тип ухода "killed" (убит ночью)';
    }
  }

  if (Array.isArray(shots)) {
    const night1 = shots.find((s) => s && Number(s.night_number) === 1);
    if (night1) {
      if (night1.result === 'killed') {
        if (Number(night1.target_seat) !== Number(fkSeat.seat_number)) {
          return `Выбранный первоубиенный игрок (место ${fkSeat.seat_number}) не совпадает с целью убийства в первую ночь (слот ${night1.target_seat})`;
        }
      } else if (night1.result === 'miss' || night1.result === 'agreement_failed') {
        return `В первую ночь был промах или нестрел, первоубиенного быть не должно`;
      }
    }
  }

  return null;
}

export function validateBestMoves(
  bestMoves: any[],
  firstKilledParticipantId: string | null | undefined,
  zeroRoundVotedParticipantId: string | null | undefined,
  allParticipantIds: string[],
  playerResults?: any[],
  tableSize = 10,
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
      if (fkResult && !leftAs(fkResult, 'killed')) {
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
      if (zrResult && !leftAs(zrResult, 'voted_zero_round')) {
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
      if (!Number.isInteger(seatNum) || seatNum < 1 || seatNum > tableSize) {
        return `Все номера мест в ЛХ должны быть целыми числами от 1 до ${tableSize}`;
      }
      if (seenSeats.has(seatNum)) {
        return 'Номера мест в ЛХ не могут повторяться';
      }
      seenSeats.add(seatNum);
    }
  }

  return null;
}

export function validatePlayerResults(
  playerResults: any[],
  gameSeats: any[],
  firstKilledParticipantId?: string | null,
  tableSize = 10,
): string | null {
  if (!Array.isArray(playerResults)) {
    return 'Результаты игроков должны быть массивом';
  }

  if (playerResults.length !== tableSize) {
    return `Результаты игроков должны содержать ровно ${tableSize} записей`;
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

    if (pr.exit_type !== undefined && !isGameExitType(pr.exit_type)) {
      return `Недопустимый тип ухода из игры: ${pr.exit_type}`;
    }

    if (pr.exit_order !== undefined && pr.exit_order !== null) {
      if (!Number.isInteger(pr.exit_order) || pr.exit_order < 1 || pr.exit_order > tableSize) {
        return `Порядок ухода из игры должен быть целым числом от 1 до ${tableSize} или null`;
      }
    }

    if (pr.regular_fouls !== undefined) {
      if (!Number.isInteger(pr.regular_fouls) || pr.regular_fouls < 0 || pr.regular_fouls > 4) {
        return 'Обычные фолы должны быть целым числом от 0 до 4';
      }
    }

    if (pr.minor_technical_fouls !== undefined) {
      if (!Number.isInteger(pr.minor_technical_fouls) || pr.minor_technical_fouls < 0) {
        return 'Малые тех. фолы должны быть целым неотрицательным числом';
      }
    }
    if (pr.major_technical_fouls !== undefined) {
      if (!Number.isInteger(pr.major_technical_fouls) || pr.major_technical_fouls < 0) {
        return 'Большие тех. фолы должны быть целым неотрицательным числом';
      }
    }

    const minor = pr.minor_technical_fouls || 0;
    const major = pr.major_technical_fouls || 0;
    const techSum = minor + major;

    if (techSum > 2) {
      return 'Сумма малых и больших тех. фолов не может превышать 2';
    }

    if (techSum === 2 && pr.exit_type !== 'removed') {
      return 'Два технических фола требуют статус removed';
    }

    if (pr.judge_bonus !== undefined && (typeof pr.judge_bonus !== 'number' || !Number.isFinite(pr.judge_bonus))) {
      return 'Бонусные баллы судьи должны быть числом';
    }

    if (pr.judge_bonus !== undefined && Math.abs(pr.judge_bonus) > 1) {
      return 'Бонусные баллы судьи: допустимо от -1 до 1';
    }

    if (pr.protocol_bonus !== undefined && (typeof pr.protocol_bonus !== 'number' || !Number.isFinite(pr.protocol_bonus))) {
      return 'Баллы протокола должны быть числом';
    }

    if (pr.protocol_bonus !== undefined && Math.abs(pr.protocol_bonus) > 1) {
      return 'Баллы протокола: допустимо от -1 до 1';
    }

    if (pr.penalty_points !== undefined && (typeof pr.penalty_points !== 'number' || !Number.isFinite(pr.penalty_points))) {
      return 'Штрафные баллы должны быть конечным числом';
    }

    if (pr.regular_fouls === 4 && pr.exit_type !== 'removed') {
      return '4 обычных фола требуют статус removed';
    }

    if (pr.removal_reason && !isRemovalReason(pr.removal_reason)) {
      return 'Указана неверная причина удаления';
    }
    if (pr.removal_reason && pr.exit_type !== 'removed') {
      return 'Указанная причина удаления требует статус removed';
    }
    if (pr.removal_reason === '4th_foul' && pr.regular_fouls !== 4) {
      return 'Причина 4th_foul требует ровно 4 обычных фола';
    }
    if (pr.removal_reason === '2nd_tech' && techSum !== 2) {
      return 'Причина 2nd_tech требует ровно два технических фола';
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
      if (pr.color_protocol.length > 0 && !leftAs(pr, 'killed')) {
        return 'Цветовой протокол разрешён только для убитого игрока';
      }
      const marksBySeat = new Map<number, string>();
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
            if (!Number.isInteger(num) || num < 1 || num > tableSize) {
              return `Номера мест в цветовом протоколе должны быть от 1 до ${tableSize}`;
            }
            if (num === Number(pr.seat_number)) {
              return 'В цветовом протоколе нельзя указывать собственное место';
            }
            const color = entry.mark === 'sheriff' ? 'red' : entry.mark;
            const previousColor = marksBySeat.get(num);
            if (previousColor && previousColor !== color) {
              return `Игрок #${num} указан с противоречивыми цветами`;
            }
            marksBySeat.set(num, color);
            if (seenSeats.has(num)) {
              return 'Номера мест в цветовом протоколе не могут повторяться';
            }
            seenSeats.add(num);
          }
        }
      }
    }
  }

  if (seenParticipantIds.size !== tableSize) {
    return `Результаты должны содержать ровно ${tableSize} уникальных участников`;
  }

  return null;
}

export function validateShots(shots: any, tableSize = 10, players?: any[], requireResponsibility = false): string | null {
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
    // A night without a named target is a miss and has no seat (the live recorder writes 0 for it; old games say agreement_failed).
    const noTarget = (s.result === 'agreement_failed' || s.result === 'miss') && (s.target_seat === 0 || s.target_seat === null || s.target_seat === undefined);
    if (!noTarget && (!Number.isInteger(ts) || ts < 1 || ts > tableSize)) {
      return `Номер цели должен быть целым числом от 1 до ${tableSize}`;
    }

    if (!['killed', 'miss', 'agreement_failed'].includes(s.result)) {
      return 'Недопустимый результат стрельбы. Возможные значения: killed, miss, agreement_failed';
    }
    if (s.miss_reason != null && !['error', 'intentional'].includes(s.miss_reason)) return 'Неверная причина промаха';
    if (s.result === 'killed' && (s.miss_reason != null || s.miss_responsible_seats?.length)) return 'У успешного выстрела не может быть виновников промаха';
    const responsible = s.miss_responsible_seats ?? [];
    if (!Array.isArray(responsible) || responsible.length > 3 || new Set(responsible).size !== responsible.length
      || responsible.some((seat: unknown) => typeof seat !== 'number' || !Number.isInteger(seat) || seat < 1 || seat > tableSize)) return 'Ответственные за промах: выберите уникальные места чёрных игроков';
    if (responsible.length && s.miss_reason !== 'error') return 'Ответственные назначаются только за ошибку или несострел';
    if (players && responsible.some((seat: number) => !['mafia', 'don'].includes(normalizeGameRole(players.find((player) => Number(player.seat_number) === seat)?.role) || ''))) return 'Ответственным за промах может быть только чёрный игрок';
    if (requireResponsibility && s.miss_reason === 'error' && !responsible.length) return `Ночь ${nn}: выберите ответственных за ошибку или отметьте промах как неоценённый`;
  }

  return null;
}



