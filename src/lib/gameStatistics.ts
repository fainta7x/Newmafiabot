import type { LiveGameEvent } from '../shared/liveGameEvents';
import { winRatePercent } from '../shared/stats';
import { buildGameAnalysis, type AnalysisCircle } from './liveGameAnalysis';

/**
 * Statistics across games, step 3 of the chronology (owner, 2026-10-05): the club overview for the organizer and the
 * «Игра в цифрах» block of a player. Pure: it only reads finished games with the roles of their seats and the
 * chronology (the events the Live Game engine wrote), so it covers games saved after the chronology shipped.
 */

export type StatRole = 'citizen' | 'sheriff' | 'mafia' | 'don';

export interface StatGame {
  id: string;
  source: 'club' | 'tournament';
  date: string;
  winner: 'red' | 'black' | null;
  seats: Array<{ seat: number; role: StatRole | null; playerId: string | null }>;
  events: LiveGameEvent[];
}

/** `percent` is null while there is nothing to divide by, so a screen can show «—» instead of a misleading 0. */
export interface Share { count: number; total: number; percent: number | null }

const share = (count: number, total: number): Share => ({ count, total, percent: total > 0 ? winRatePercent(count, total) : null });
const average = (sum: number, count: number): number | null => (count > 0 ? Math.round((sum / count) * 10) / 10 : null);

const isBlack = (role: StatRole | null | undefined) => role === 'mafia' || role === 'don';
const isRed = (role: StatRole | null | undefined) => role === 'citizen' || role === 'sheriff';

interface Prepared {
  game: StatGame;
  circles: AnalysisCircle[];
  roleOf: (seat: number | null | undefined) => StatRole | null;
}

const prepare = (games: StatGame[]): Prepared[] => games
  .filter((game) => Array.isArray(game.events) && game.events.length > 0)
  .map((game) => {
    const roles = new Map(game.seats.map((item) => [item.seat, item.role]));
    return { game, circles: buildGameAnalysis(game.events).circles, roleOf: (seat) => (seat ? roles.get(seat) ?? null : null) };
  });

/** A day of the game = an engine round in which somebody was voted on. */
const votingDays = (circles: AnalysisCircle[]) => circles.filter((circle) => circle.votings.length > 0);

export interface ClubGameStatistics {
  /** Finished games that have a chronology, out of `gamesTotal`. */
  games: number;
  gamesTotal: number;
  averageVotingDays: number | null;
  days: number;
  revoteDays: Share;
  tableDecisions: Share;
  zeroRound: { games: number; blackVotedOut: Share };
  nights: { shots: number; sheriffChecks: Share; donChecks: Share };
  firstKilled: { games: number; bestMoveWithBlack: Share; averageBlackInBestMove: number | null };
  /** Red wins by how many days with a voting the game lasted. */
  byLength: Array<{ days: number; label: string; games: number; redWins: Share }>;
}

export const buildClubGameStatistics = (games: StatGame[]): ClubGameStatistics => {
  const prepared = prepare(games);
  let daysTotal = 0;
  let revoteDays = 0;
  let votings = 0;
  let tableDecisions = 0;
  let zeroGames = 0;
  let zeroBlack = 0;
  let shots = 0;
  let sheriffChecks = 0;
  let sheriffFoundBlack = 0;
  let donChecks = 0;
  let donFoundSheriff = 0;
  let firstKilledGames = 0;
  let lhCount = 0;
  let lhWithBlack = 0;
  let lhBlackSum = 0;
  const byLength = new Map<number, { games: number; redWins: number }>();

  for (const { game, circles, roleOf } of prepared) {
    const days = votingDays(circles);
    daysTotal += days.length;
    for (const day of days) {
      if (day.votings.length > 1) revoteDays += 1;
      for (const voting of day.votings) {
        votings += 1;
        if (voting.tableVoters.length > 0) tableDecisions += 1;
      }
    }
    const zero = circles.find((circle) => circle.zeroRoundVoted);
    if (zero?.zeroRoundVoted) { zeroGames += 1; if (isBlack(roleOf(zero.zeroRoundVoted))) zeroBlack += 1; }
    for (const circle of circles) {
      if (circle.shot) shots += 1;
      if (circle.sheriffCheck) { sheriffChecks += 1; if (isBlack(roleOf(circle.sheriffCheck.target))) sheriffFoundBlack += 1; }
      if (circle.donCheck) { donChecks += 1; if (roleOf(circle.donCheck.target) === 'sheriff') donFoundSheriff += 1; }
      if (circle.bestMove && circle.bestMove.seat && circle.bestMove.seats.length) {
        const blacks = circle.bestMove.seats.filter((seat) => isBlack(roleOf(seat))).length;
        lhCount += 1; lhBlackSum += blacks; if (blacks > 0) lhWithBlack += 1;
      }
    }
    if (circles.some((circle) => circle.firstKilled)) firstKilledGames += 1;
    if (game.winner) {
      const bucket = byLength.get(Math.min(days.length, 6)) || { games: 0, redWins: 0 };
      bucket.games += 1; if (game.winner === 'red') bucket.redWins += 1;
      byLength.set(Math.min(days.length, 6), bucket);
    }
  }

  return {
    games: prepared.length,
    gamesTotal: games.length,
    averageVotingDays: average(daysTotal, prepared.length),
    days: daysTotal,
    revoteDays: share(revoteDays, daysTotal),
    tableDecisions: share(tableDecisions, votings),
    zeroRound: { games: zeroGames, blackVotedOut: share(zeroBlack, zeroGames) },
    nights: { shots, sheriffChecks: share(sheriffFoundBlack, sheriffChecks), donChecks: share(donFoundSheriff, donChecks) },
    firstKilled: { games: firstKilledGames, bestMoveWithBlack: share(lhWithBlack, lhCount), averageBlackInBestMove: average(lhBlackSum, lhCount) },
    byLength: [...byLength.entries()].sort((a, b) => a[0] - b[0]).map(([days, value]) => ({
      days,
      label: days >= 6 ? '6 и больше' : String(days),
      games: value.games,
      redWins: share(value.redWins, value.games),
    })),
  };
};

export interface PlayerGameStatistics {
  /** Games of the player that have a chronology. */
  games: number;
  /** Of the votes he cast as a red player (the marked ballots), how many went to a black player. */
  votesAsRed: Share;
  /** Of the players he nominated as a red player, how many were black. */
  nominationsAsRed: Share;
  bestMove: { count: number; averageBlack: number | null; withBlack: Share };
  firstKilled: Share;
  sheriffChecks: Share;
  donChecks: Share;
}

export const buildPlayerGameStatistics = (games: StatGame[], playerId: string): PlayerGameStatistics => {
  const prepared = prepare(games).filter(({ game }) => game.seats.some((item) => item.playerId === playerId));
  let votes = 0; let votesForBlack = 0;
  let nominations = 0; let nominationsBlack = 0;
  let lhCount = 0; let lhBlackSum = 0; let lhWithBlack = 0;
  let firstKilledCount = 0; let firstKilledChances = 0;
  let sheriffChecks = 0; let sheriffHits = 0;
  let donChecks = 0; let donHits = 0;

  for (const { game, circles, roleOf } of prepared) {
    const mine = game.seats.find((item) => item.playerId === playerId)!;
    const seat = mine.seat;
    if (isRed(mine.role)) firstKilledChances += 1;
    for (const circle of circles) {
      if (isRed(mine.role)) {
        for (const voting of circle.votings) {
          for (const { candidate, voters } of voting.votes) {
            if (!voters.includes(seat)) continue;
            votes += 1;
            if (isBlack(roleOf(candidate))) votesForBlack += 1;
          }
        }
        for (const nomination of circle.nominations) {
          if (nomination.by !== seat) continue;
          nominations += 1;
          if (isBlack(roleOf(nomination.seat))) nominationsBlack += 1;
        }
      }
      if (circle.firstKilled === seat && isRed(mine.role)) firstKilledCount += 1;
      if (circle.bestMove?.seat === seat && circle.bestMove.seats.length) {
        const blacks = circle.bestMove.seats.filter((target) => isBlack(roleOf(target))).length;
        lhCount += 1; lhBlackSum += blacks; if (blacks > 0) lhWithBlack += 1;
      }
      if (mine.role === 'sheriff' && circle.sheriffCheck) { sheriffChecks += 1; if (isBlack(roleOf(circle.sheriffCheck.target))) sheriffHits += 1; }
      if (mine.role === 'don' && circle.donCheck) { donChecks += 1; if (roleOf(circle.donCheck.target) === 'sheriff') donHits += 1; }
    }
  }

  return {
    games: prepared.length,
    votesAsRed: share(votesForBlack, votes),
    nominationsAsRed: share(nominationsBlack, nominations),
    bestMove: { count: lhCount, averageBlack: average(lhBlackSum, lhCount), withBlack: share(lhWithBlack, lhCount) },
    firstKilled: share(firstKilledCount, firstKilledChances),
    sheriffChecks: share(sheriffHits, sheriffChecks),
    donChecks: share(donHits, donChecks),
  };
};
