import { getPlayerGameRoleLabel } from './playerGameRoleLabels.ts';
import { rankRolePerformance } from './rolePerformance.ts';
import { countWins, russianPlural } from './russianPlural.ts';

export type ResultSample = { games: number; wins: number; win_rate: number };
export const gameResultText = ({games,wins}: Pick<ResultSample,'games'|'wins'>) => `${countWins(wins)} из ${games} ${russianPlural(games,'игры','игр','игр')}`;
type RoleSample = ResultSample & { role: string };
type Performance = { career: ResultSample; recent10: ResultSample; red: ResultSample; black: ResultSample; roles: RoleSample[] };

/** Disjoint comparison only when both nested windows are complete and consistent. */
export function previousTenResults(recent10: ResultSample, recent20: ResultSample): ResultSample | null {
  if (recent10.games !== 10 || recent20.games !== 20) return null;
  const wins = recent20.wins - recent10.wins;
  if (![recent10.wins, recent20.wins, wins].every(Number.isInteger) || recent10.wins < 0 || recent10.wins > 10 || wins < 0 || wins > 10) return null;
  return { games: 10, wins, win_rate: wins * 10 };
}

/** Team outcomes describe observations, never improvement, causality or role skill. */
export function playerResultObservations({ career, recent10, red, black, roles }: Performance) {
  const observations: Array<{ kind: string; title: string; text: string }> = [];
  if (recent10.games > 0) observations.push({
    kind: 'recent_results', title: 'Результаты последних игр',
    text: `Последние игры: ${gameResultText(recent10)}; за карьеру — ${gameResultText(career)}.`,
  });
  const highest = rankRolePerformance(roles)[0];
  const lowest = rankRolePerformance(roles, true)[0];
  if (highest && lowest && highest.role !== lowest.role && highest.win_rate - lowest.win_rate >= 20) observations.push({
    kind: 'role_gap', title: 'Результаты по ролям',
    text: `${getPlayerGameRoleLabel(highest.role) ?? highest.role}: ${gameResultText(highest)}; ${getPlayerGameRoleLabel(lowest.role) ?? lowest.role}: ${gameResultText(lowest)}.`,
  });
  if (red.games > 0 && black.games > 0 && Math.abs(red.win_rate - black.win_rate) >= 15) observations.push({
    kind: 'side_gap', title: 'Победы за разные команды',
    text: `За красных: ${red.wins} из ${red.games}; за чёрных: ${black.wins} из ${black.games}.`,
  });
  return observations;
}
