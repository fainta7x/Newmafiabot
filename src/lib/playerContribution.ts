import { gameActionFacts, redRole, blackRole } from './gameActionFacts.ts';
import type { StatGame, StatRole } from './gameStatistics.ts';
import { sanitizeLiveGameEvents } from '../shared/liveGameEvents.ts';
import { normalizeGameRole } from '../shared/gameRoles.ts';

/**
 * Individual contribution of a seat in one club game, in the same «points» as the personal game points (1 point = 40 Elo).
 * Owner, 2026-10-25: no role adjustment — every found black is praised. The roles are balanced by the weights instead: on the
 * club's games an average game is worth about +6 Elo for a citizen, +9 for the sheriff, +7 for a mafia and +6 for the don.
 * Votings are the ones `gameActionFacts` keeps (zero circle and days with two or more players leaving at once are left out),
 * and of those only a voting after which exactly one player left the table (owner, 2026-10-25): a voting that ends in a
 * revote, with nobody leaving or with several leaving can be an agreed split, so a vote there is not the voter's own read.
 *
 * Owner, 2026-10-25:
 * - a red earns +0.2 for each **different** black he voted for, once per black and the same on the critical circle (Polemica's
 *   «найденный чёрный»: three blacks found is the whole job, voting again for the same black earns nothing more); a vote for
 *   a red costs every time, twice on the critical circle;
 * - wrong colours in the will are punished harder than in Polemica, so a random guess is worth zero (a «black» mark is right
 *   1 time in 3, a «red» mark 2 times in 3);
 * - a black is judged only by what the dead reds left about him in their wills; votes against a black do not move his points.
 */
export const CONTRIBUTION_WEIGHTS = {
  foundBlack: 0.2, voteRed: -0.1, criticalFactor: 2,
  colorRight: { red: 0.2, black: 0.3 }, colorWrong: { calledRed: -0.4, calledBlack: -0.15 },
  sheriffFoundBlack: 0.1,
  blackNamedRed: 0.2, blackNamedBlack: -0.2, blackNotNamed: 0.1,
} as const;

export type ContributionKind = 'found_black' | 'obvious_black' | 'vote_red' | 'will_right' | 'will_wrong' | 'check_black' | 'named_red' | 'named_black' | 'not_named';
/** One line of the breakdown: what the player did, about which seat, and its points. */
export interface ContributionItem { kind: ContributionKind; seat: number; points: number; critical?: boolean }
export interface SeatContribution { seat: number; role: StatRole | null; points: number; items: ContributionItem[] }

const seatList = (value: unknown): number[] => (Array.isArray(value) ? [...new Set(value.map(Number).filter((seat) => Number.isInteger(seat) && seat > 0))] : []);

/**
 * A black the voter did not have to find himself (owner, 2026-10-25). It applies to a red who voted for a red in the voting
 * at nine players and was then given a black check by a false sheriff (a black who claimed sheriff) at that night or
 * later: from the next day the false sheriff and every black his real sheriff has already checked are obvious to him, so
 * a vote for them earns nothing — only blacks nobody has checked yet still count. A black check by the don before the
 * circle at nine changes nothing.
 */
function obviousBlacksFor(seat: number, facts: ReturnType<typeof gameActionFacts>, roleOf: Map<number, StatRole | null>) {
  const never = () => false;
  const events = facts.events;
  const atNine = events.filter((event) => event.kind === 'vote' && event.seat === seat && event.phase === 'day_voting'
    && event.target != null && redRole(roleOf.get(event.target)) && facts.atSeq.get(event.seq)?.size === 9);
  if (!atNine.length) return never;
  const nineRound = Math.min(...atNine.map((event) => event.round));
  // The announced checks as they stand at the end (a removed check no longer counts).
  const announced = new Map<string, { claimer: number; target: number; night: number; color: string }>();
  for (const event of events) {
    if (!event.seat || !event.target) continue;
    const key = `${event.seat}:${event.target}`;
    if (event.kind === 'announced_check') {
      const night = Number(String(event.phase).match(/^night_(\d+)$/)?.[1] || event.round);
      announced.set(key, { claimer: event.seat, target: event.target, night, color: String(event.value) });
    } else if (event.kind === 'announced_check_removed') announced.delete(key);
  }
  const falseCheck = [...announced.values()]
    .filter((check) => check.target === seat && check.color === 'black' && blackRole(roleOf.get(check.claimer)) && check.night >= nineRound)
    .sort((a, b) => a.night - b.night)[0];
  if (!falseCheck) return never;
  const fromRound = falseCheck.night + 1;
  const roundOfSeq = new Map(events.map((event) => [event.seq, event.round]));
  const sheriffChecks = facts.checks.filter((check) => check.kind === 'sheriff' && blackRole(roleOf.get(check.target)))
    .map((check) => ({ target: check.target, round: roundOfSeq.get(check.seq) ?? Infinity }));
  return (target: number, votingRound: number) => votingRound >= fromRound
    && (target === falseCheck.claimer || sheriffChecks.some((check) => check.target === target && check.round < votingRound));
}

export function gameContribution(envelope: any): SeatContribution[] {
  const protocol = envelope?.protocol || {};
  const results: any[] = Array.isArray(envelope?.player_results) ? envelope.player_results : [];
  const seats = results
    .map((result) => ({ seat: Number(result?.seat_number), role: normalizeGameRole(result?.role) as StatRole | null, playerId: String(result?.player_id || '') || null, colors: Array.isArray(result?.color_protocol) ? result.color_protocol : [] }))
    .filter((item) => Number.isInteger(item.seat) && item.seat > 0);
  const roleOf = new Map(seats.map((item) => [item.seat, item.role]));
  const facts = gameActionFacts({
    id: '', source: 'club', date: '', winner: protocol.winner_team === 'red' || protocol.winner_team === 'black' ? protocol.winner_team : null,
    seats: seats.map(({ seat, role, playerId }) => ({ seat, role: role as any, playerId })), events: sanitizeLiveGameEvents(protocol.events),
  } satisfies StatGame);
  const W = CONTRIBUTION_WEIGHTS;
  const marks = (item: { colors: any[] }, mark: string) => new Set(item.colors.filter((entry) => entry?.mark === mark).flatMap((entry) => seatList(entry?.seat_numbers)));
  return seats.map((me) => {
    const items: ContributionItem[] = [];
    if (redRole(me.role)) {
      const found = new Map<number, boolean>();
      const obvious = new Set<number>();
      const isObvious = obviousBlacksFor(me.seat, facts, roleOf);
      for (const voting of facts.votings.filter((item) => item.outcome === 'single_eliminated')) {
        const target = voting.votes.get(me.seat);
        if (!target) continue;
        const critical = voting.critical === true;
        if (blackRole(roleOf.get(target))) {
          if (isObvious(target, voting.round)) { if (!found.has(target)) obvious.add(target); } else { found.set(target, true); obvious.delete(target); }
        } else if (redRole(roleOf.get(target))) items.push({ kind: 'vote_red', seat: target, points: W.voteRed * (critical ? W.criticalFactor : 1), critical });
      }
      for (const seat of found.keys()) items.push({ kind: 'found_black', seat, points: W.foundBlack });
      for (const seat of obvious) items.push({ kind: 'obvious_black', seat, points: 0 });
      for (const seat of marks(me, 'red')) {
        if (redRole(roleOf.get(seat))) items.push({ kind: 'will_right', seat, points: W.colorRight.red });
        else if (blackRole(roleOf.get(seat))) items.push({ kind: 'will_wrong', seat, points: W.colorWrong.calledRed });
      }
      for (const seat of marks(me, 'black')) {
        if (blackRole(roleOf.get(seat))) items.push({ kind: 'will_right', seat, points: W.colorRight.black });
        else if (redRole(roleOf.get(seat))) items.push({ kind: 'will_wrong', seat, points: W.colorWrong.calledBlack });
      }
      if (me.role === 'sheriff') {
        for (const check of facts.checks) if (check.kind === 'sheriff' && blackRole(roleOf.get(check.target))) items.push({ kind: 'check_black', seat: check.target, points: W.sheriffFoundBlack });
      }
    } else if (blackRole(me.role)) {
      for (const other of seats.filter((item) => redRole(item.role) && item.colors.length)) {
        if (marks(other, 'red').has(me.seat)) items.push({ kind: 'named_red', seat: other.seat, points: W.blackNamedRed });
        else if (marks(other, 'black').has(me.seat)) items.push({ kind: 'named_black', seat: other.seat, points: W.blackNamedBlack });
        else items.push({ kind: 'not_named', seat: other.seat, points: W.blackNotNamed });
      }
    }
    const points = items.reduce((sum, item) => sum + item.points, 0);
    return { seat: me.seat, role: me.role, points, items };
  });
}

const elo = (points: number) => Math.round(points * 40);
const signedElo = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;
const seatNumbers = (items: ContributionItem[]) => {
  const counts = new Map<number, number>();
  for (const item of items) counts.set(item.seat, (counts.get(item.seat) || 0) + 1);
  return [...counts].map(([seat, count]) => `№${seat}${count > 1 ? ` (${count} ${count < 5 ? 'раза' : 'раз'})` : ''}`).join(', ');
};
const group = (label: string, items: ContributionItem[]) => (items.length ? `${label} ${seatNumbers(items)}: ${signedElo(elo(items.reduce((sum, item) => sum + item.points, 0)))}` : null);

/**
 * The breakdown of a seat's contribution in short plain words and Elo (owner, 2026-10-25: «попроще и попонятнее»), one
 * line per kind of action, e.g. «Голосовал в чёрных №10, №1: +16»; the lines add up to the total unless the ±35 cap applied.
 */
export function contributionBreakdown(role: StatRole | null, items: ContributionItem[]): string[] {
  const of = (kind: ContributionKind) => items.filter((item) => item.kind === kind);
  const lines = blackRole(role)
    ? [group('Записан красным у', of('named_red')), group('Записан чёрным у', of('named_black')), group('Не записан у', of('not_named'))]
    : [
      group('Голосовал в чёрных', of('found_black')),
      group('Голосовал в уже известных чёрных (без баллов)', of('obvious_black')),
      group('Голосовал в красных', of('vote_red')),
      group('Угадал цвета', of('will_right')),
      group('Ошибся в цветах', of('will_wrong')),
      group('Проверкой нашёл чёрного', of('check_black')),
    ];
  return lines.filter((line): line is string => Boolean(line));
}
