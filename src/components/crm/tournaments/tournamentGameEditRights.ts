import type { TournamentGame } from '../../../lib/api.ts';

/**
 * What the organizer may change in the selected tournament game: judge, roles and seats. Moved unchanged out of
 * TournamentDetailViewBase so the rules have their own tests.
 */
export function tournamentGameEditRights(
  tournamentStatus: string,
  games: TournamentGame[],
  currentGame: TournamentGame | undefined,
) {
  const seats = currentGame?.seats || [];
  // Check active game in entire tournament
  const activeGameInTournament = games.find((g) => g.status === 'active');
  const isAnotherGameActive = Boolean(
    activeGameInTournament && currentGame && activeGameInTournament.id !== currentGame.id
  );

  // Calculate role stats for selected game
  const roleCounts = {
    citizen: seats.filter((s) => s.role === 'citizen').length,
    sheriff: seats.filter((s) => s.role === 'sheriff').length,
    mafia: seats.filter((s) => s.role === 'mafia').length,
    don: seats.filter((s) => s.role === 'don').length,
  };

  const isCorrection = tournamentStatus === 'correction';
  const canEditCurrentGameJudgeAndRoles = Boolean(
    currentGame &&
      (((tournamentStatus === 'draft' || tournamentStatus === 'active') && currentGame.status === 'planned') ||
        (isCorrection &&
          currentGame.status === 'active' &&
          (currentGame as any).protocol_status === 'draft' &&
          !isAnotherGameActive))
  );

  // A judge who cannot continue can be replaced in the middle of the running game (until its protocol is completed).
  const canEditJudgeInline = canEditCurrentGameJudgeAndRoles || Boolean(
    currentGame &&
      tournamentStatus === 'active' &&
      currentGame.status === 'active' &&
      (currentGame as any).protocol_status !== 'completed'
  );

  const canSwapSeatsCurrentGame = Boolean(
    currentGame &&
      tournamentStatus !== 'completed' &&
      currentGame.status !== 'completed' &&
      (((tournamentStatus === 'draft' || tournamentStatus === 'active') && currentGame.status === 'planned') ||
        (isCorrection &&
          currentGame.status === 'active' &&
          (currentGame as any).protocol_status === 'draft' &&
          !isAnotherGameActive))
  );

  return { activeGameInTournament, isAnotherGameActive, roleCounts, isCorrection, canEditCurrentGameJudgeAndRoles, canEditJudgeInline, canSwapSeatsCurrentGame };
}
