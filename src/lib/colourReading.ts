import type { StatGame } from './gameStatistics';
import { buildGameAnalysis } from './liveGameAnalysis';

/**
 * «Читать цвет» (owner, 2026-11-02/03; rules: docs/BUSINESS_RULES.md «"Обучение": reading colours of specific players»).
 * Top-3 lists per player from the per-voter ballots of the game chronology, ranked by count, no minimum of games.
 * Split votes («попил») are not counted: only a day whose first voting put out one player is read; a day that had a tie
 * (revote, table decision, nobody or everybody out) is left out whole. Pure and read-only.
 */

export type ColourReadingListKey =
  | 'mine_correct' | 'mine_wrong' | 'mine_don' | 'mine_sheriff'
  | 'me_correct' | 'me_wrong'
  | 'mafia_against' | 'mafia_with'
  | 'don_against' | 'don_with';

export interface ColourReadingEntry { playerId: string; count: number }
export type ColourReading = Record<ColourReadingListKey, ColourReadingEntry[]> & { games: number };

const KEYS: ColourReadingListKey[] = ['mine_correct', 'mine_wrong', 'mine_don', 'mine_sheriff', 'me_correct', 'me_wrong', 'mafia_against', 'mafia_with', 'don_against', 'don_with'];
const isBlack = (role: string | null | undefined) => role === 'mafia' || role === 'don';
const isRed = (role: string | null | undefined) => role === 'citizen' || role === 'sheriff';

export const TOP_SIZE = 3;

export function buildColourReading(games: StatGame[], playerId: string, top = TOP_SIZE): ColourReading {
  const counters = Object.fromEntries(KEYS.map((key) => [key, new Map<string, number>()])) as Record<ColourReadingListKey, Map<string, number>>;
  const add = (key: ColourReadingListKey, other: string | null | undefined) => {
    if (!other || other === playerId) return;
    counters[key].set(other, (counters[key].get(other) || 0) + 1);
  };
  let games_ = 0;
  for (const game of games) {
    const mine = game.seats.find((seat) => seat.playerId === playerId);
    if (!mine) continue;
    const bySeat = new Map(game.seats.map((seat) => [seat.seat, seat]));
    const analysis = buildGameAnalysis(game.events || []);
    let counted = false;
    for (const circle of analysis.circles) {
      const votings = circle.votings.filter((voting) => voting.votes.length > 0);
      if (!votings.length) continue;
      const first = votings.slice().sort((a, b) => a.number - b.number)[0];
      if (votings.length > 1 || first.outcome !== 'single_eliminated') continue;
      const ballots = new Map<number, number>();
      for (const vote of first.votes) for (const voter of vote.voters) ballots.set(voter, vote.candidate);
      const myTarget = ballots.get(mine.seat) ?? null;
      for (const [voterSeat, targetSeat] of ballots) {
        const voter = bySeat.get(voterSeat);
        const target = bySeat.get(targetSeat);
        if (!voter || !target) continue;
        counted = true;
        if (voterSeat === mine.seat) {
          // The player's own votes count only while he is red (owner, 2026-11-03).
          if (!isRed(mine.role)) continue;
          if (isBlack(target.role)) add('mine_correct', target.playerId);
          if (isRed(target.role)) add('mine_wrong', target.playerId);
          if (target.role === 'don') add('mine_don', target.playerId);
          if (target.role === 'sheriff') add('mine_sheriff', target.playerId);
          continue;
        }
        if (!isRed(voter.role)) continue;
        if (targetSeat === mine.seat) {
          if (isBlack(mine.role)) add('me_correct', voter.playerId);
          if (isRed(mine.role)) add('me_wrong', voter.playerId);
          if (mine.role === 'mafia') add('mafia_against', voter.playerId);
          if (mine.role === 'don') add('don_against', voter.playerId);
        } else if (myTarget !== null && targetSeat === myTarget) {
          if (mine.role === 'mafia') add('mafia_with', voter.playerId);
          if (mine.role === 'don') add('don_with', voter.playerId);
        }
      }
    }
    if (counted) games_ += 1;
  }
  const result = { games: games_ } as ColourReading;
  for (const key of KEYS) {
    result[key] = [...counters[key]].map(([id, count]) => ({ playerId: id, count }))
      .sort((a, b) => b.count - a.count || a.playerId.localeCompare(b.playerId))
      .slice(0, top);
  }
  return result;
}
