import type { ZeroRoundRule } from '../shared/zeroRoundRule.ts';
import { leftAs } from './protocolConsistency.ts';
import { determineVotingResult, validateVotingHierarchy } from '../shared/tournamentVoting.ts';

export interface ProtocolVotingValidationResult {
  errorMsg: string | null;
  roundIndexWithError: number | null;
}

export interface ProtocolVotingOptions { tableSize?: number; zeroRoundRule?: ZeroRoundRule; }

function validateVotesCore(
  votes: any,
  isComplete: boolean = false,
  playerResults?: any[],
  zeroRoundVotedId?: string | null,
  setRound: (index: number | null) => void = () => {},
  { tableSize = 10, zeroRoundRule = 'tournament' }: ProtocolVotingOptions = {},
): string | null {
  if (votes === undefined || votes === null) return null;
  if (!Array.isArray(votes)) {
    return 'Протокол голосований должен быть массивом';
  }

  const seenRounds = new Set<number>();
  const usedParents = new Set<number>();

  for (let rIdx = 0; rIdx < votes.length; rIdx++) {
    setRound(rIdx);
    const r = votes[rIdx];
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

    const roundNum = r.round_number;
    const dayNum = r.day_number ?? (rIdx === 0 ? 0 : 1);
    const eligibleVoters = r.eligible_voters !== undefined && r.eligible_voters !== null ? Number(r.eligible_voters) : tableSize;

    // Requirement 1: Zero round voters count
    if (dayNum === 0) {
      if (eligibleVoters !== tableSize) {
        return `Голосование (этап #${roundNum}, день ${dayNum}): количество голосующих в нулевом круге должно быть строго равно ${tableSize}.`;
      }
    }

    // Requirement 2: Revote day_number and eligible_voters inheritance & strict validation
    if (r.is_revote) {
      if (r.parent_round_number === undefined || r.parent_round_number === null) {
        return `Голосование (этап #${roundNum}, день ${dayNum}): переголосование обязано содержать явный parent_round_number.`;
      }

      const parentRoundNum = Number(r.parent_round_number);
      if (usedParents.has(parentRoundNum)) {
        return `Голосование (этап #${roundNum}, день ${dayNum}): обнаружено дублирующееся переголосование для раунда #${parentRoundNum}.`;
      }
      usedParents.add(parentRoundNum);

      const parentRound = votes.find((v: any) => Number(v.round_number) === parentRoundNum);
      if (!parentRound) {
        return `Голосование (этап #${roundNum}, день ${dayNum}): родительское голосование #${parentRoundNum} не найдено.`;
      }

      const parentIdx = votes.findIndex((v: any) => Number(v.round_number) === parentRoundNum);
      if (parentIdx >= rIdx) {
        return `Голосование (этап #${roundNum}, день ${dayNum}): родительское голосование должно предшествовать переголосованию.`;
      }

      if (parentRound.outcome !== 'tie_revote') {
        return `Голосование (этап #${roundNum}, день ${dayNum}): родительское голосование должно иметь исход tie_revote.`;
      }

      // Verify that parent actually had a tie by vote counts
      const parentNominated = parentRound.nominated_seats || [];
      const parentVoteCounts = parentRound.vote_counts || {};
      let parentMaxVotes = -1;
      let parentWinnersCount = 0;
      for (const seat of parentNominated) {
        const v = Number(parentVoteCounts[seat] ?? parentVoteCounts[String(seat)] ?? 0);
        if (v > parentMaxVotes) {
          parentMaxVotes = v;
          parentWinnersCount = 1;
        } else if (v === parentMaxVotes) {
          parentWinnersCount++;
        }
      }
      if (parentWinnersCount <= 1 && parentNominated.length > 0) {
        return `Голосование (этап #${roundNum}, день ${dayNum}): родительское голосование не имеет ничьей по голосам.`;
      }

      const parentDayNum = parentRound.day_number ?? 0;
      const parentEligibleVoters = parentRound.eligible_voters !== undefined && parentRound.eligible_voters !== null ? Number(parentRound.eligible_voters) : tableSize;

      if (dayNum !== parentDayNum) {
        return `Голосование (этап #${roundNum}, день ${dayNum}): день переголосования (${dayNum}) должен совпадать с днём родительского голосования (${parentDayNum}).`;
      }
      if (eligibleVoters !== parentEligibleVoters) {
        return `Голосование (этап #${roundNum}, день ${dayNum}): количество голосующих переголосования (${eligibleVoters}) должно совпадать с количеством родительского голосования (${parentEligibleVoters}).`;
      }
    }

    if (isComplete) {
      // 1. Пустой этап
      if (r.nominated_seats.length === 0) {
        return `Запрещено завершать протокол с пустым кругом голосования (круг #${roundNum}, день ${dayNum}).`;
      }

      // 2. Не указано количество голосующих
      if (r.eligible_voters === undefined || r.eligible_voters === null || Number(r.eligible_voters) <= 0) {
        return `Голосование (этап #${roundNum}, день ${dayNum}): не указано количество имеющих право голоса.`;
      }
    }

    const nominatedSet = new Set<number>();
    for (const seat of r.nominated_seats) {
      const num = Number(seat);
      if (!Number.isInteger(num) || num < 1 || num > tableSize) {
        return `Номера кандидатов должны быть целыми числами от 1 до ${tableSize}`;
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

    let sumVotes = 0;
    for (const [key, val] of Object.entries(r.vote_counts)) {
      const seatKey = Number(key);
      if (!Number.isInteger(seatKey) || seatKey < 1 || seatKey > tableSize || !nominatedSet.has(seatKey)) {
        return 'Лишние кандидаты в vote_counts запрещены';
      }

      const count = Number(val);
      if (!Number.isInteger(count) || count < 0 || count > tableSize) {
        return `Количество голосов должно быть целым числом от 0 до ${tableSize}`;
      }
      sumVotes += count;
    }

    if (isComplete) {
      // 3. Сумма голосов не равна количеству голосующих
      if (sumVotes !== Number(r.eligible_voters)) {
        return `Голосование (этап #${roundNum}, день ${dayNum}): сумма распределённых голосов (${sumVotes}) не равна количеству голосующих (${r.eligible_voters}).`;
      }
    }

    const noms = r.nominated_seats || [];
    if (noms.length > 0) {
      const eligible = Number(r.eligible_voters ?? tableSize);
      if (noms.length === 1) {
        const onlySeat = noms[0];
        const count = Number(r.vote_counts[onlySeat] ?? r.vote_counts[String(onlySeat)] ?? 0);
        if (count !== eligible) {
          return `Голосование (этап #${roundNum}, день ${dayNum}): единственный кандидат #${onlySeat} должен получить ровно ${eligible} голосов (получено ${count}).`;
        }
      } else {
        const lastSeat = noms[noms.length - 1];
        let sumPrev = 0;
        for (let i = 0; i < noms.length - 1; i++) {
          const seat = noms[i];
          sumPrev += Number(r.vote_counts[seat] ?? r.vote_counts[String(seat)] ?? 0);
        }
        if (sumPrev > eligible) {
          return `Голосование (этап #${roundNum}, день ${dayNum}): сумма голосов предыдущих кандидатов (${sumPrev}) превышает число голосующих (${eligible}).`;
        }
        const expectedLast = eligible - sumPrev;
        const actualLast = Number(r.vote_counts[lastSeat] ?? r.vote_counts[String(lastSeat)] ?? 0);
        if (actualLast !== expectedLast) {
          return `Голосование (этап #${roundNum}, день ${dayNum}): последний кандидат #${lastSeat} должен получить автоматический остаток ${expectedLast} голосов (получено ${actualLast}).`;
        }
      }
    }

    if (isComplete) {
      // 4. Исход остался pending
      if (!r.outcome || r.outcome === 'pending') {
        return `Голосование (этап #${roundNum}, день ${dayNum}): исход голосования не подтверждён судьёй.`;
      }

      const votingResult = determineVotingResult({
        nominated_seats: r.nominated_seats,
        eligible_voters: Number(r.eligible_voters),
        is_revote: !!r.is_revote,
        vote_counts: r.vote_counts,
        table_leave_votes: r.table_leave_votes !== null && r.table_leave_votes !== undefined ? Number(r.table_leave_votes) : null
      });
      const winners = votingResult.winners;

      if (zeroRoundRule === 'club' && dayNum === 0 && votingResult.outcome === 'single_eliminated') {
        if (r.outcome !== 'no_elimination' || !Array.isArray(r.eliminated_seats) || r.eliminated_seats.length) {
          return `Голосование (этап #${roundNum}, день 0): при клубной настройке игрок #${winners[0]} остаётся за столом; исход должен быть no_elimination без выбывших.`;
        }
      } else if (votingResult.outcome === 'single_eliminated') {
        if (r.outcome !== 'single_eliminated') {
          return `Голосование (этап #${roundNum}, день ${dayNum}): исход не соответствует распределению голосов (ожидается выбывание игрока #${winners[0]}).`;
        }
        if (!r.eliminated_seats || r.eliminated_seats.length !== 1 || Number(r.eliminated_seats[0]) !== winners[0]) {
          return `Голосование (этап #${roundNum}, день ${dayNum}): выбывшие игроки противоречат исходу (ожидается игрок #${winners[0]}).`;
        }
      } else if (votingResult.outcome === 'needs_revote') {
        if (r.outcome !== 'tie_revote') {
          return `Голосование (этап #${roundNum}, день ${dayNum}): исход не соответствует распределению голосов (ожидается ничья между игроками #${winners.join(', #')}).`;
        }
        if (r.eliminated_seats && r.eliminated_seats.length > 0) {
          return `Голосование (этап #${roundNum}, день ${dayNum}): при ничьей список выбывших должен быть пуст.`;
        }
      } else if (votingResult.outcome === 'auto_no_elimination') {
        if (r.outcome !== 'no_elimination') {
          return `Голосование (этап #${roundNum}, день ${dayNum}): исход должен быть 'no_elimination', так как спорных игроков больше половины.`;
        }
        if (r.eliminated_seats && r.eliminated_seats.length > 0) {
          return `Голосование (этап #${roundNum}, день ${dayNum}): список выбывших должен быть пуст, так как большинство не набрано.`;
        }
      } else if (votingResult.outcome === 'requires_table_decision') {
        if (r.table_leave_votes === undefined || r.table_leave_votes === null) {
          return `Голосование (этап #${roundNum}, день ${dayNum}): не указаны голоса за уход всех спорных игроков при переголосовании.`;
        }
        if (votingResult.resolvedOutcome === 'all_tied_eliminated') {
          if (r.outcome !== 'all_tied_eliminated') {
            return `Голосование (этап #${roundNum}, день ${dayNum}): исход должен быть 'all_tied_eliminated' (все уходят).`;
          }
          const elims = [...(r.eliminated_seats || [])].map(Number).sort((a,b) => a-b);
          const expected = [...winners].map(Number).sort((a,b) => a-b);
          if (JSON.stringify(elims) !== JSON.stringify(expected)) {
            return `Голосование (этап #${roundNum}, день ${dayNum}): выбывшие игроки должны совпадать с кандидатами переголосования #${winners.join(', #')}.`;
          }
        } else {
          if (r.outcome !== 'no_elimination') {
            return `Голосование (этап #${roundNum}, день ${dayNum}): исход должен быть 'no_elimination' (никто не уходит).`;
          }
          if (r.eliminated_seats && r.eliminated_seats.length > 0) {
            return `Голосование (этап #${roundNum}, день ${dayNum}): список выбывших должен быть пуст, так как большинство не набрано.`;
          }
        }
      }

      // 6. Переголосование содержит не тех кандидатов
      if (r.is_revote && r.parent_round_number) {
        const parentRound = votes.find(v => Number(v.round_number) === Number(r.parent_round_number));
        if (parentRound) {
          const parentResult = determineVotingResult({
            nominated_seats: parentRound.nominated_seats,
            eligible_voters: Number(parentRound.eligible_voters),
            is_revote: !!parentRound.is_revote,
            vote_counts: parentRound.vote_counts,
            table_leave_votes: parentRound.table_leave_votes !== null && parentRound.table_leave_votes !== undefined ? Number(parentRound.table_leave_votes) : null
          });
          const currentNoms = [...(r.nominated_seats || [])].map(Number);
          const expectedNoms = [...parentResult.winners].map(Number);
          if (JSON.stringify(currentNoms) !== JSON.stringify(expectedNoms)) {
            return `Голосование (этап #${roundNum}, день ${dayNum}): список кандидатов переголосования (${currentNoms.join(', ')}) не соответствует спорным игрокам предыдущего раунда (${expectedNoms.join(', ')}).`;
          }
        }
      }
    }
  }

  setRound(null);
  if (isComplete) {
    const hierarchyError = validateVotingHierarchy(votes);
    if (hierarchyError) {
      return hierarchyError;
    }
  }

  if (isComplete && playerResults) {
    // 8. Статусы игроков не соответствуют подтверждённым исходам
    const zeroRoundEliminated = new Set<number>();
    const otherDayEliminated = new Set<number>();
    for (const round of votes) {
      if (round.outcome && round.outcome !== 'pending') {
        const dayNum = round.day_number ?? 0;
        const seats = round.eliminated_seats || [];
        if (dayNum === 0) {
          seats.forEach((s: any) => zeroRoundEliminated.add(Number(s)));
        } else {
          seats.forEach((s: any) => otherDayEliminated.add(Number(s)));
        }
      }
    }

    for (const pr of playerResults) {
      if (pr.exit_type === 'voted_zero_round' && !zeroRoundEliminated.has(Number(pr.seat_number))) {
        return `Игрок #${pr.seat_number} имеет статус ухода "Заголосован (0 круг)", но не был заголосован в подтверждённых кругах дня 0.`;
      }
      if (pr.exit_type === 'voted_day' && !otherDayEliminated.has(Number(pr.seat_number))) {
        return `Игрок #${pr.seat_number} имеет статус ухода "Заголосован", но не был заголосован в подтверждённых кругах последующих дней.`;
      }
      if (zeroRoundEliminated.has(Number(pr.seat_number)) && !leftAs(pr, 'voted_zero_round')) {
        return `Игрок #${pr.seat_number} заголосован в нулевом круге, но его статус ухода в списке игроков не "Заголосован (0 круг)".`;
      }
      if (otherDayEliminated.has(Number(pr.seat_number)) && !leftAs(pr, 'voted_day')) {
        return `Игрок #${pr.seat_number} заголосован днём, но его статус ухода в списке игроков не "Заголосован".`;
      }
    }

    // 9. Нарушены правила нулевого круга и ЛХ
    const zrCount = zeroRoundEliminated.size;
    if (zrCount === 1) {
      if (!zeroRoundVotedId) {
        return 'В нулевом круге заголосован один игрок, но в поле "Заголосованный в нулевой круг" не выбран участник.';
      }
      const targetSeat = Array.from(zeroRoundEliminated)[0];
      const targetPlayer = playerResults.find(p => Number(p.seat_number) === targetSeat);
      if (targetPlayer && targetPlayer.participant_id !== zeroRoundVotedId) {
        return `Игрок в поле "Заголосованный в нулевой круг" должен совпадать с выбывшим игроком #${targetSeat}.`;
      }
    } else {
      if (zeroRoundVotedId !== null && zeroRoundVotedId !== '' && zeroRoundVotedId !== undefined) {
        return `В нулевом круге заголосовано ${zrCount} игроков (не 1), поэтому поле "Заголосованный в нулевой круг" должно быть сброшено.`;
      }
    }
  }

  return null;
}

/** Same voting rules for API saves and the completion form; the form owns focus presentation. */
export function validateProtocolVoting(
  votes: any,
  playerResults?: any[],
  zeroRoundVotedId?: string | null,
  isComplete = true,
  options: ProtocolVotingOptions = {},
): ProtocolVotingValidationResult {
  let roundIndexWithError: number | null = null;
  const errorMsg = validateVotesCore(votes, isComplete, playerResults, zeroRoundVotedId, index => { roundIndexWithError = index; }, options);
  return { errorMsg, roundIndexWithError: errorMsg ? roundIndexWithError : null };
}

export function validateVotes(votes: any, isComplete = false, playerResults?: any[], zeroRoundVotedId?: string | null, options: ProtocolVotingOptions = {}): string | null {
  return validateProtocolVoting(votes, playerResults, zeroRoundVotedId, isComplete, options).errorMsg;
}
