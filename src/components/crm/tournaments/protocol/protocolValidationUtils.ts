import { validateBestMoves, validateFirstKilled, validatePlayerResults, validateShots } from '../../../../lib/protocolConsistency.ts';
import { normalizeGameRole } from '../../../../shared/gameRoles.ts';
import type { PlayerResultData, TournamentGameProtocolData } from '../../../../lib/api';
import { validateProtocolVoting, type ProtocolVotingValidationResult } from '../../../../lib/protocolVotingValidation.ts';
export { validateProtocolVoting } from '../../../../lib/protocolVotingValidation.ts';

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
    const role = normalizeGameRole(player.role);
    if (role) roleCounts[role]++;
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

  const consistencyError = validatePlayerResults(playerResults, playerResults, protocol.first_killed_participant_id)
    || validateShots(protocol.shots)
    || validateBestMoves(protocol.best_moves || [], protocol.first_killed_participant_id, protocol.zero_round_voted_participant_id, playerResults.map(player => player.participant_id), playerResults)
    || validateFirstKilled(protocol.first_killed_participant_id, playerResults, playerResults, protocol.shots || []);
  if (consistencyError) return generalValidationError(consistencyError);

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
