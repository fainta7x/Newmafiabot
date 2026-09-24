import type { PlayerResultData, TournamentGameProtocolData } from '../../../../lib/api';
import {
  determineVotingResult,
  validateVotingHierarchy,
} from '../../../../shared/tournamentVoting';

export interface ProtocolVotingValidationResult {
  errorMsg: string | null;
  roundIndexWithError: number | null;
}

export const validateProtocolVoting = (
  votes: any[],
  results: PlayerResultData[],
  zeroRoundVotedId: string | null,
): ProtocolVotingValidationResult => {
  if (!votes || votes.length === 0) {
    return { errorMsg: null, roundIndexWithError: null };
  }

  for (let rIdx = 0; rIdx < votes.length; rIdx++) {
    const round = votes[rIdx];
    const roundNum = round.round_number ?? (rIdx + 1);
    const dayNum = round.day_number ?? (rIdx === 0 ? 0 : 1);

    if (!round.nominated_seats || round.nominated_seats.length === 0) {
      return {
        errorMsg: `Запрещено завершать протокол с пустым кругом голосования (круг #${roundNum}, день ${dayNum}).`,
        roundIndexWithError: rIdx,
      };
    }

    if (round.eligible_voters === undefined || round.eligible_voters === null || round.eligible_voters <= 0) {
      return {
        errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): не указано количество имеющих право голоса.`,
        roundIndexWithError: rIdx,
      };
    }

    const sumVotes = round.nominated_seats.reduce(
      (sum: number, seat: number) => sum + (round.vote_counts?.[seat] || 0),
      0,
    );

    if (sumVotes !== round.eligible_voters) {
      return {
        errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): сумма распределённых голосов (${sumVotes}) не равна количеству голосующих (${round.eligible_voters}).`,
        roundIndexWithError: rIdx,
      };
    }

    const noms = round.nominated_seats || [];
    if (noms.length > 0) {
      const eligible = Number(round.eligible_voters ?? 10);
      if (noms.length === 1) {
        const onlySeat = noms[0];
        const count = Number(round.vote_counts?.[onlySeat] ?? 0);
        if (count !== eligible) {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): единственный кандидат #${onlySeat} должен получить ровно ${eligible} голосов (получено ${count}).`,
            roundIndexWithError: rIdx,
          };
        }
      } else {
        const lastSeat = noms[noms.length - 1];
        let sumPrev = 0;
        for (let i = 0; i < noms.length - 1; i++) {
          const seat = noms[i];
          sumPrev += Number(round.vote_counts?.[seat] ?? 0);
        }
        if (sumPrev > eligible) {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): сумма голосов предыдущих кандидатов (${sumPrev}) превышает число голосующих (${eligible}).`,
            roundIndexWithError: rIdx,
          };
        }
        const expectedLast = eligible - sumPrev;
        const actualLast = Number(round.vote_counts?.[lastSeat] ?? 0);
        if (actualLast !== expectedLast) {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): последний кандидат #${lastSeat} должен получить автоматический остаток ${expectedLast} голосов (получено ${actualLast}).`,
            roundIndexWithError: rIdx,
          };
        }
      }
    }

    if (!round.outcome || round.outcome === 'pending') {
      return {
        errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): исход голосования не подтверждён судьёй.`,
        roundIndexWithError: rIdx,
      };
    }

    const votingResult = determineVotingResult({
      nominated_seats: round.nominated_seats,
      eligible_voters: Number(round.eligible_voters),
      is_revote: !!round.is_revote,
      vote_counts: round.vote_counts,
      table_leave_votes:
        round.table_leave_votes !== null && round.table_leave_votes !== undefined
          ? Number(round.table_leave_votes)
          : null,
    });
    const winners = votingResult.winners;

    if (votingResult.outcome === 'single_eliminated') {
      if (round.outcome !== 'single_eliminated') {
        return {
          errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): исход не соответствует распределению голосов (ожидается выбывание игрока #${winners[0]}).`,
          roundIndexWithError: rIdx,
        };
      }
      if (
        !round.eliminated_seats ||
        round.eliminated_seats.length !== 1 ||
        Number(round.eliminated_seats[0]) !== winners[0]
      ) {
        return {
          errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): выбывшие игроки противоречат исходу (ожидается игрок #${winners[0]}).`,
          roundIndexWithError: rIdx,
        };
      }
    } else if (votingResult.outcome === 'needs_revote') {
      if (round.outcome !== 'tie_revote') {
        return {
          errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): исход не соответствует распределению голосов (ожидается ничья между игроками #${winners.join(', #')}).`,
          roundIndexWithError: rIdx,
        };
      }
      if (round.eliminated_seats && round.eliminated_seats.length > 0) {
        return {
          errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): при ничьей список выбывших должен быть пуст.`,
          roundIndexWithError: rIdx,
        };
      }
    } else if (votingResult.outcome === 'auto_no_elimination') {
      if (round.outcome !== 'no_elimination') {
        return {
          errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): исход должен быть 'no_elimination', так как спорных игроков больше половины.`,
          roundIndexWithError: rIdx,
        };
      }
      if (round.eliminated_seats && round.eliminated_seats.length > 0) {
        return {
          errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): список выбывших должен быть пуст, так как большинство не набрано.`,
          roundIndexWithError: rIdx,
        };
      }
    } else if (votingResult.outcome === 'requires_table_decision') {
      if (round.table_leave_votes === undefined || round.table_leave_votes === null) {
        return {
          errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): не указаны голоса за уход всех спорных игроков при переголосовании.`,
          roundIndexWithError: rIdx,
        };
      }
      if (votingResult.resolvedOutcome === 'all_tied_eliminated') {
        if (round.outcome !== 'all_tied_eliminated') {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): исход должен быть 'all_tied_eliminated' (все уходят).`,
            roundIndexWithError: rIdx,
          };
        }
        const elims = [...(round.eliminated_seats || [])].map(Number).sort((a, b) => a - b);
        const expected = [...winners].map(Number).sort((a, b) => a - b);
        if (JSON.stringify(elims) !== JSON.stringify(expected)) {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): выбывшие игроки должны совпадать с кандидатами переголосования #${winners.join(', #')}.`,
            roundIndexWithError: rIdx,
          };
        }
      } else {
        if (round.outcome !== 'no_elimination') {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): исход должен быть 'no_elimination' (никто не уходит).`,
            roundIndexWithError: rIdx,
          };
        }
        if (round.eliminated_seats && round.eliminated_seats.length > 0) {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): список выбывших должен быть пуст, так как большинство не набрано.`,
            roundIndexWithError: rIdx,
          };
        }
      }
    }

    if (round.is_revote && round.parent_round_number) {
      const parentRound = votes.find(
        (vote) => Number(vote.round_number) === Number(round.parent_round_number),
      );
      if (parentRound) {
        const parentResult = determineVotingResult({
          nominated_seats: parentRound.nominated_seats,
          eligible_voters: Number(parentRound.eligible_voters),
          is_revote: !!parentRound.is_revote,
          vote_counts: parentRound.vote_counts,
          table_leave_votes:
            parentRound.table_leave_votes !== null && parentRound.table_leave_votes !== undefined
              ? Number(parentRound.table_leave_votes)
              : null,
        });
        const currentNoms = [...(round.nominated_seats || [])].map(Number);
        const expectedNoms = [...parentResult.winners].map(Number);
        if (JSON.stringify(currentNoms) !== JSON.stringify(expectedNoms)) {
          return {
            errorMsg: `Голосование (этап #${roundNum}, день ${dayNum}): список кандидатов переголосования (${currentNoms.join(', ')}) не соответствует спорным игрокам предыдущего раунда (${expectedNoms.join(', ')}).`,
            roundIndexWithError: rIdx,
          };
        }
      }
    }
  }

  const hierarchyError = validateVotingHierarchy(votes);
  if (hierarchyError) {
    return {
      errorMsg: hierarchyError,
      roundIndexWithError: null,
    };
  }

  const zeroRoundEliminated = new Set<number>();
  const otherDayEliminated = new Set<number>();
  for (const round of votes) {
    if (round.outcome && round.outcome !== 'pending') {
      const dayNum = round.day_number ?? 0;
      const seats = round.eliminated_seats || [];
      if (dayNum === 0) {
        seats.forEach((seat: number) => zeroRoundEliminated.add(seat));
      } else {
        seats.forEach((seat: number) => otherDayEliminated.add(seat));
      }
    }
  }

  for (const player of results) {
    if (player.exit_type === 'voted_zero_round' && !zeroRoundEliminated.has(player.seat_number)) {
      return {
        errorMsg: `Игрок #${player.seat_number} имеет статус ухода "Заголосован (0 круг)", но не был заголосован в подтверждённых кругах дня 0.`,
        roundIndexWithError: null,
      };
    }
    if (player.exit_type === 'voted_day' && !otherDayEliminated.has(player.seat_number)) {
      return {
        errorMsg: `Игрок #${player.seat_number} имеет статус ухода "Заголосован", но не был заголосован в подтверждённых кругах последующих дней.`,
        roundIndexWithError: null,
      };
    }
    if (zeroRoundEliminated.has(player.seat_number) && player.exit_type !== 'voted_zero_round') {
      return {
        errorMsg: `Игрок #${player.seat_number} заголосован в нулевом круге, но его статус ухода в списке игроков не "Заголосован (0 круг)".`,
        roundIndexWithError: null,
      };
    }
    if (otherDayEliminated.has(player.seat_number) && player.exit_type !== 'voted_day') {
      return {
        errorMsg: `Игрок #${player.seat_number} заголосован днём, но его статус ухода в списке игроков не "Заголосован".`,
        roundIndexWithError: null,
      };
    }
  }

  const zeroRoundEliminatedCount = zeroRoundEliminated.size;
  if (zeroRoundEliminatedCount === 1) {
    if (!zeroRoundVotedId) {
      return {
        errorMsg: 'В нулевом круге заголосован один игрок, но в поле "Заголосованный в нулевой круг" не выбран участник.',
        roundIndexWithError: null,
      };
    }
    const targetSeat = Array.from(zeroRoundEliminated)[0];
    const targetPlayer = results.find((player) => player.seat_number === targetSeat);
    if (targetPlayer && targetPlayer.participant_id !== zeroRoundVotedId) {
      return {
        errorMsg: `Игрок в поле "Заголосованный в нулевой круг" должен совпадать с выбывшим игроком #${targetSeat}.`,
        roundIndexWithError: null,
      };
    }
  } else if (zeroRoundVotedId !== null && zeroRoundVotedId !== '') {
    return {
      errorMsg: `В нулевом круге заголосовано ${zeroRoundEliminatedCount} игроков (не 1), поэтому поле "Заголосованный в нулевой круг" должно быть сброшено (пусто).`,
      roundIndexWithError: null,
    };
  }

  return { errorMsg: null, roundIndexWithError: null };
};


export interface ProtocolCompletionValidationResult extends ProtocolVotingValidationResult {
  source: 'general' | 'voting' | null;
}

const generalValidationError = (errorMsg: string): ProtocolCompletionValidationResult => ({
  errorMsg,
  roundIndexWithError: null,
  source: 'general',
});

// Pure completion validation: React owns only presentation/focus side effects around this result.
export const validateProtocolCompletion = (
  protocol: TournamentGameProtocolData,
  playerResults: PlayerResultData[],
  hasUnclassifiedLegacyTechFouls: boolean,
): ProtocolCompletionValidationResult => {
  if (!protocol.winner_team || !['red', 'black'].includes(protocol.winner_team)) {
    return generalValidationError('Необходимо выбрать победившую команду (Красные или Чёрные)');
  }

  if (!playerResults || playerResults.length !== 10) {
    return generalValidationError('В протоколе должно быть ровно 10 игроков');
  }

  const roleCounts: Record<string, number> = { citizen: 0, sheriff: 0, mafia: 0, don: 0 };
  for (const player of playerResults) {
    const role = (player.role || '').toLowerCase();
    if (role === 'мирянин' || role === 'мирный') roleCounts.citizen++;
    else if (role === 'шериф') roleCounts.sheriff++;
    else if (role === 'мафия') roleCounts.mafia++;
    else if (role === 'дон') roleCounts.don++;
    else if (roleCounts[role] !== undefined) roleCounts[role]++;
  }
  if (
    roleCounts.citizen !== 6 ||
    roleCounts.sheriff !== 1 ||
    roleCounts.mafia !== 2 ||
    roleCounts.don !== 1
  ) {
    return generalValidationError(
      'Не все роли участников корректно распределены (требуется: 6 мирных, 1 Шериф, 2 Мафии, 1 Дон)',
    );
  }

  if (protocol.first_killed_participant_id) {
    const firstKilled = playerResults.find(
      (player) => player.participant_id === protocol.first_killed_participant_id,
    );
    if (firstKilled && firstKilled.exit_type !== 'killed') {
      return generalValidationError('Первоубиенный игрок должен иметь тип ухода "killed" (убит ночью)');
    }
  }

  if (protocol.zero_round_voted_participant_id) {
    const zeroRoundVoted = playerResults.find(
      (player) => player.participant_id === protocol.zero_round_voted_participant_id,
    );
    if (zeroRoundVoted && zeroRoundVoted.exit_type !== 'voted_zero_round') {
      return generalValidationError(
        'Заголосованный в нулевой круг игрок должен иметь тип ухода "voted_zero_round"',
      );
    }
  }

  if (
    protocol.first_killed_participant_id &&
    protocol.zero_round_voted_participant_id &&
    protocol.first_killed_participant_id === protocol.zero_round_voted_participant_id
  ) {
    return generalValidationError(
      'Первоубиенный игрок и заголосованный в нулевой круг не могут быть одним и тем же игроком',
    );
  }

  if (protocol.best_moves && protocol.best_moves.length > 0) {
    const seenParticipants = new Set<string>();
    const seenSources = new Set<string>();
    for (const bestMove of protocol.best_moves) {
      if (seenParticipants.has(bestMove.participant_id)) {
        return generalValidationError('Один участник не может иметь два ЛХ');
      }
      seenParticipants.add(bestMove.participant_id);

      if (seenSources.has(bestMove.source)) {
        return generalValidationError('Источник ЛХ не может повторяться');
      }
      seenSources.add(bestMove.source);

      if (
        bestMove.source === 'first_killed' &&
        bestMove.participant_id !== protocol.first_killed_participant_id
      ) {
        return generalValidationError(
          'Для ЛХ первого убитого участник обязан совпадать с первоубиенным',
        );
      }
      if (
        bestMove.source === 'zero_round_voted' &&
        bestMove.participant_id !== protocol.zero_round_voted_participant_id
      ) {
        return generalValidationError(
          'Для ЛХ выбывшего в 0 круге участник обязан совпадать с заголосованным в 0 круг',
        );
      }
    }
  }

  if (hasUnclassifiedLegacyTechFouls) {
    return generalValidationError(
      'Необходимо классифицировать старые техфолы для всех игроков (малый/большой)',
    );
  }

  const voting = validateProtocolVoting(
    protocol.votes || [],
    playerResults,
    protocol.zero_round_voted_participant_id,
  );
  if (voting.errorMsg) {
    return {
      ...voting,
      source: 'voting',
    };
  }

  return {
    errorMsg: null,
    roundIndexWithError: null,
    source: null,
  };
};
