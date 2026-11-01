import type { TournamentGameProtocolData } from './api';
import type { LiveGameEvent } from '../shared/liveGameEvents';
import type { VotingRound } from '../shared/tournamentVoting';
import { CLASSIC_TABLE_SIZE } from './tableComposition';
import { TABLE_NAMES } from './circleNames';

const MISSES_IN_WORDS: Record<number, string> = { 2: 'двух', 3: 'трёх', 4: 'четырёх', 5: 'пяти', 6: 'шести', 7: 'семи', 8: 'восьми', 9: 'девяти' };


/**
 * The circle's name by how many players sit at the table (owner, 2026-10-26; BUSINESS_RULES «Names of the circles»):
 * «Нулевой круг», «Девятка», «Восьмёрка после промаха», «Восьмёрка после оставления при 8 и двух промахов» … Without a chronology the
 * number of players is unknown, so an old game keeps «Круг N».
 * Who left comes from the protocol itself — its votings and shots — so a corrected protocol renames the circles that follow
 * (owner, 2026-10-27: game №20 kept «Семёрка» after the vote that put №3 out was corrected to «everybody stayed»). Only a
 * judge's removal, which the protocol does not place in time, is read from the chronology.
 */
export const circleTitle = (
  index: number,
  protocol?: Partial<Pick<TournamentGameProtocolData, 'events' | 'votes' | 'shots'>> | null,
  tableSize = CLASSIC_TABLE_SIZE,
) => {
  if (index === 0) return 'Нулевой круг';
  const events = Array.isArray(protocol?.events) ? protocol!.events : [];
  // Only a game without any chronology keeps «Круг N»; with one, a circle where nobody has left yet is the «Десятка» (owner: official names everywhere).
  if (!events.length) return `Круг ${index}`;
  const votes = Array.isArray(protocol?.votes) ? (protocol!.votes as unknown as VotingRound[]) : null;
  const shots = Array.isArray(protocol?.shots) ? protocol!.shots : null;
  // A cancelled exit («restored») gives the seat back.
  const journalOut = new Map<number, LiveGameEvent>();
  for (const event of events) {
    if (!event.seat || event.round > index) continue;
    if (event.kind === 'exit') journalOut.set(event.seat, event); else if (event.kind === 'restored') journalOut.delete(event.seat);
  }
  // Day d is voted in engine round d + 1, night n closes engine round n.
  const votedOutOnDay = (day: number) => (votes
    ? [...new Set(votes.filter((round) => Number(round.day_number ?? 0) === day && (round.outcome === 'single_eliminated' || round.outcome === 'all_tied_eliminated')).flatMap((round) => round.eliminated_seats || []).map(Number))]
    : [...journalOut.values()].filter((event) => event.round === day + 1 && event.value !== 'killed' && event.value !== 'removed').map((event) => Number(event.seat)));
  const killedAtNight = (night: number) => (shots
    ? shots.filter((shot) => Number(shot.night_number) === night && shot.result === 'killed' && Number(shot.target_seat) > 0).map((shot) => Number(shot.target_seat))
    : [...journalOut.values()].filter((event) => event.round === night && event.value === 'killed').map((event) => Number(event.seat)));
  const atTableAt = (circle: number) => {
    const out = new Set<number>();
    for (let day = 0; day < circle; day += 1) votedOutOnDay(day).forEach((seat) => out.add(seat));
    for (let night = 1; night <= circle; night += 1) killedAtNight(night).forEach((seat) => out.add(seat));
    for (const event of journalOut.values()) if (event.value === 'removed' && event.round <= circle) out.add(Number(event.seat));
    return tableSize - out.size;
  };
  const name = TABLE_NAMES[atTableAt(index)] || `Круг ${index}`;
  const dayOut = votedOutOnDay(index - 1).length;
  // Nobody left on the previous day (a split with everybody staying, or nobody nominated): «оставление» (owner, 2026-10-27).
  const stayed = dayOut === 0 && index > 1;
  let misses = 0;
  for (let night = index; night >= 1 && killedAtNight(night).length === 0; night -= 1) misses += 1;
  const notes: string[] = [];
  // Owner, 2026-10-27: «Восьмёрка после оставления при 8 и двух промахов»; the zero round with everybody staying is the standard
  // course of the game, so it gives no qualifier; a raised split stays «попила с подъёмом».
  if (dayOut >= 2) notes.push('попила с подъёмом');
  else if (stayed) notes.push(`оставления при ${atTableAt(index - 1)}`);
  if (misses === 1) notes.push('промаха');
  else if (misses > 1) notes.push(`${MISSES_IN_WORDS[misses] || misses} промахов`);
  return notes.length ? `${name} после ${notes.join(' и ')}` : name;
};
