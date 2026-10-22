import type { TournamentGame } from '../../../lib/api.ts';

/**
 * What the organizer may change in the selected tournament game: judge, roles and seats. The same rule as the server
 * (src/server/services/tournamentGameEditPolicy.ts, owner 2026-10-22: «чем гибче и быстрее всё правится, тем лучше»):
 * a game that has not started or is still running (protocol not completed) — everything; a completed game — the judge
 * at once, roles and seats after «Исправить»; a completed tournament — «Исправить» first. Another running game never
 * blocks an edit; `isAnotherGameActive` only tells the setup screen which game is running.
 */
export function tournamentGameEditRights(
  tournamentStatus: string,
  games: TournamentGame[],
  currentGame: TournamentGame | undefined,
) {
  const seats = currentGame?.seats || [];
  const activeGameInTournament = games.find((g) => g.status === 'active' && g.id !== currentGame?.id)
    || games.find((g) => g.status === 'active');
  const isAnotherGameActive = Boolean(
    activeGameInTournament && currentGame && activeGameInTournament.id !== currentGame.id
  );

  const roleCounts = {
    citizen: seats.filter((s) => s.role === 'citizen').length,
    sheriff: seats.filter((s) => s.role === 'sheriff').length,
    mafia: seats.filter((s) => s.role === 'mafia').length,
    don: seats.filter((s) => s.role === 'don').length,
  };

  const isCorrection = tournamentStatus === 'correction';
  const editableTournament = tournamentStatus === 'draft' || tournamentStatus === 'active' || isCorrection;
  const protocolCompleted = (currentGame as any)?.protocol_status === 'completed';
  const runningOpen = Boolean(currentGame && currentGame.status === 'active' && !protocolCompleted);

  const canEditCurrentGameJudgeAndRoles = Boolean(
    currentGame && editableTournament && (currentGame.status === 'planned' || runningOpen)
  );
  const canEditJudgeInline = canEditCurrentGameJudgeAndRoles || Boolean(
    currentGame && editableTournament && currentGame.status === 'completed'
  );
  const canSwapSeatsCurrentGame = canEditCurrentGameJudgeAndRoles;
  // «Исправить» on a completed game (or a game whose protocol is completed): reopens it, and a completed tournament first.
  const canCorrectCurrentGame = Boolean(
    currentGame && (currentGame.status === 'completed' || protocolCompleted)
      && (editableTournament || tournamentStatus === 'completed')
  );

  return {
    activeGameInTournament, isAnotherGameActive, roleCounts, isCorrection,
    canEditCurrentGameJudgeAndRoles, canEditJudgeInline, canSwapSeatsCurrentGame, canCorrectCurrentGame,
  };
}
