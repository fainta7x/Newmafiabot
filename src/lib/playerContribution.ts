import { gameActionFacts, redRole, blackRole } from './gameActionFacts.ts';
import type { StatGame, StatRole } from './gameStatistics.ts';
import { sanitizeLiveGameEvents } from '../shared/liveGameEvents.ts';
import { normalizeGameRole } from '../shared/gameRoles.ts';
import { ELO_PERSONAL_POINT_WEIGHT } from '../shared/eloWeights.ts';
import { decisionStreakMultipliers, type StreakDecision } from './eloDecisionStreak.ts';
import { missedShotNights, MISSED_SHOT_ELO } from './eloMissPenalty.ts';

/**
 * Individual contribution of a seat in one club game, in the same «points» as the personal game points (1 point = 10 Elo).
 * Owner, 2026-10-25: no role adjustment — every found black is praised. The roles are balanced by the weights instead: on the
 * club's games an average game is worth the prior +6/+9/+7/+6 Elo before the personal weight was reduced on 2026-10-25.
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

export type ContributionKind = 'found_black' | 'obvious_black' | 'vote_red' | 'will_right' | 'will_wrong' | 'check_black' | 'named_red' | 'named_black' | 'not_named' | 'will_blocked' | 'streak_correct' | 'streak_wrong' | 'shot_miss';
/** One line of the breakdown: what the player did, about which seat, and its points. */
export interface ContributionItem { kind: ContributionKind; seat: number; points: number; critical?: boolean; night?: number }
export interface SeatContribution { seat: number; role: StatRole | null; points: number; items: ContributionItem[] }
interface ColorProtocolEntry { mark?: unknown; seat_numbers?: unknown }

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
    .map((result) => ({ seat: Number(result?.seat_number), role: normalizeGameRole(result?.role) as StatRole | null, playerId: String(result?.player_id || '') || null, colors: (Array.isArray(result?.color_protocol) ? result.color_protocol : []) as ColorProtocolEntry[], exitType: String(result?.exit_type || ''), exitOrder: Number(result?.exit_order) }))
    .filter((item) => Number.isInteger(item.seat) && item.seat > 0);
  const roleOf = new Map(seats.map((item) => [item.seat, item.role]));
  const facts = gameActionFacts({
    id: '', source: 'club', date: '', winner: protocol.winner_team === 'red' || protocol.winner_team === 'black' ? protocol.winner_team : null,
    seats: seats.map(({ seat, role, playerId }) => ({ seat, role: role as any, playerId })), events: sanitizeLiveGameEvents(protocol.events),
  } satisfies StatGame);
  const W = CONTRIBUTION_WEIGHTS;
  // Old protocols bypassed the new validation. Ignore self marks and contradictory evidence in a rebuild too.
  const colorsBySeat = new Map(seats.map((item) => {
    const red = new Set<number>(); const black = new Set<number>(); const mentioned = new Set<number>();
    for (const entry of item.colors) {
      if (typeof entry?.mark !== 'string' || !['red', 'black', 'sheriff'].includes(entry.mark)) continue;
      for (const seat of seatList(entry.seat_numbers)) {
        if (seat === item.seat || !roleOf.has(seat)) continue;
        mentioned.add(seat);
        if (entry.mark === 'black') black.add(seat); else red.add(seat);
      }
    }
    const conflicts = new Set([...red].filter((seat) => black.has(seat)));
    for (const seat of conflicts) mentioned.delete(seat);
    // A sheriff label is red evidence for conflict detection; its own scoring rule stays unchanged.
    const marks = (mark: string) => new Set(item.colors.filter((entry) => entry?.mark === mark)
      .flatMap((entry) => seatList(entry?.seat_numbers)).filter((seat) => mentioned.has(seat)));
    return [item.seat, { red: marks('red'), sheriff: marks('sheriff'), black: marks('black'), mentioned, conflicts }] as const;
  }));
  const deaths = new Map<number, typeof facts.events[number]>();
  for (const event of facts.events) {
    if (!event.seat) continue;
    if (event.kind === 'exit' && event.value === 'killed') deaths.set(event.seat, event);
    else if (event.kind === 'restored') deaths.delete(event.seat);
  }
  const killedEvent = (seat: number) => deaths.get(seat);
  const wasAliveForWill = (me: typeof seats[number], other: typeof seats[number]): boolean => {
    const death = killedEvent(other.seat);
    if (death && (facts.full || facts.events.some((event) => event.kind === 'exit' && event.seat === me.seat))) {
      return facts.atSeq.get(death.seq)?.has(me.seat) === true;
    }
    if (Number.isInteger(me.exitOrder) && me.exitOrder > 0 && Number.isInteger(other.exitOrder) && other.exitOrder > 0) {
      return me.exitOrder > other.exitOrder;
    }
    // Alive at the finish is sufficient evidence; otherwise an unknown chronology earns nothing.
    return me.exitType === 'alive';
  };
  return seats.map((me) => {
    const items: ContributionItem[] = [];
    if (redRole(me.role)) {
      const decisions: StreakDecision<ContributionItem>[] = [];
      const found = new Map<number, ContributionItem>();
      const obvious = new Set<number>();
      const isObvious = obviousBlacksFor(me.seat, facts, roleOf);
      for (const voting of facts.votings.filter((item) => item.outcome === 'single_eliminated')) {
        const target = voting.votes.get(me.seat);
        if (!target) continue;
        const critical = voting.critical === true;
        if (blackRole(roleOf.get(target))) {
          if (isObvious(target, voting.round)) { if (!found.has(target)) obvious.add(target); }
          else if (!found.has(target)) {
            const item: ContributionItem = { kind: 'found_black', seat: target, points: W.foundBlack };
            found.set(target, item); obvious.delete(target);
            if (facts.full && voting.seq != null) decisions.push({ seq: voting.seq, sign: 1, items: [item] });
          }
        } else if (redRole(roleOf.get(target))) {
          const item: ContributionItem = { kind: 'vote_red', seat: target, points: W.voteRed * (critical ? W.criticalFactor : 1), critical };
          items.push(item);
          // Preserve existing base scoring; a self-vote does not establish a colour-reading streak.
          if (target !== me.seat && facts.full && voting.seq != null) decisions.push({ seq: voting.seq, sign: -1, items: [item] });
        }
      }
      items.push(...found.values());
      for (const seat of obvious) items.push({ kind: 'obvious_black', seat, points: 0 });
      const will: ContributionItem[] = [];
      for (const seat of colorsBySeat.get(me.seat)!.red) {
        if (redRole(roleOf.get(seat))) will.push({ kind: 'will_right', seat, points: W.colorRight.red });
        else if (blackRole(roleOf.get(seat))) will.push({ kind: 'will_wrong', seat, points: W.colorWrong.calledRed });
      }
      for (const seat of colorsBySeat.get(me.seat)!.black) {
        if (blackRole(roleOf.get(seat))) will.push({ kind: 'will_right', seat, points: W.colorRight.black });
        else if (redRole(roleOf.get(seat))) will.push({ kind: 'will_wrong', seat, points: W.colorWrong.calledBlack });
      }
      // A sheriff label on a black is still a wrong red colour; compatible red+sheriff labels count once.
      for (const seat of colorsBySeat.get(me.seat)!.sheriff) {
        if (!colorsBySeat.get(me.seat)!.red.has(seat) && blackRole(roleOf.get(seat))) will.push({ kind: 'will_wrong', seat, points: W.colorWrong.calledRed });
      }
      const result = results.find((row) => Number(row?.seat_number) === me.seat);
      const markedFirstKilled = String(protocol.first_killed_participant_id || '') === String(result?.participant_id || '')
        && Boolean(protocol.first_killed_participant_id);
      const firstKilledSeat = facts.events.filter((event) => event.kind === 'first_killed').at(-1)?.seat;
      const firstKilled = Object.hasOwn(protocol, 'first_killed_participant_id') ? markedFirstKilled : firstKilledSeat === me.seat;
      const wrong = will.filter((item) => item.kind === 'will_wrong');
      const right = will.filter((item) => item.kind === 'will_right');
      if (wrong.length && !firstKilled) {
        items.push(...wrong);
        if (right.length) items.push({ kind: 'will_blocked', seat: me.seat, points: 0 });
      } else items.push(...will);
      if (me.role === 'sheriff') {
        const checkedTargets = new Set<number>();
        for (const check of facts.checks) if (check.kind === 'sheriff' && blackRole(roleOf.get(check.target))) {
          const item: ContributionItem = { kind: 'check_black', seat: check.target, points: W.sheriffFoundBlack };
          items.push(item);
          if (facts.full && !checkedTargets.has(check.target)) decisions.push({ seq: check.seq, sign: 1, items: [item] });
          checkedTargets.add(check.target);
        }
      }
      const willSeq = facts.full ? killedEvent(me.seat)?.seq ?? null : null;
      // One will is a simultaneous batch. Mixed PU evidence keeps its base positives, but cannot
      // borrow an arbitrary mark order to extend a cross-action streak.
      if ((!wrong.length || firstKilled) && right.length) decisions.push({ seq: wrong.length ? null : willSeq, sign: 1, items: right });
      if (wrong.length) decisions.push({ seq: firstKilled && right.length ? null : willSeq, sign: -1, items: wrong });
      // Owner, 2026-10-26: the first killed is rated by his best move and his will, without a series bonus.
      for (const [item, factor] of firstKilled ? [] : decisionStreakMultipliers(decisions)) {
        const extra = item.points * (factor - 1);
        if (Math.abs(extra) > 1e-10) items.push({ kind: extra > 0 ? 'streak_correct' : 'streak_wrong', seat: item.seat, points: extra });
      }
    } else if (blackRole(me.role)) {
      for (const night of missedShotNights(protocol, me.seat)) items.push({ kind: 'shot_miss', seat: me.seat, night, points: -MISSED_SHOT_ELO / ELO_PERSONAL_POINT_WEIGHT });
      for (const other of seats.filter((item) => redRole(item.role) && item.colors.length)) {
        const colors = colorsBySeat.get(other.seat)!;
        if ((other.exitType !== 'killed' && !killedEvent(other.seat)) || !colors.mentioned.size
          || colors.conflicts.has(me.seat) || !wasAliveForWill(me, other)) continue;
        if (colors.red.has(me.seat) || colors.sheriff.has(me.seat)) items.push({ kind: 'named_red', seat: other.seat, points: W.blackNamedRed });
        else if (colors.black.has(me.seat)) items.push({ kind: 'named_black', seat: other.seat, points: W.blackNamedBlack });
        else items.push({ kind: 'not_named', seat: other.seat, points: W.blackNotNamed });
      }
    }
    const points = items.reduce((sum, item) => sum + item.points, 0);
    return { seat: me.seat, role: me.role, points, items };
  });
}

const elo = (points: number) => Math.round(points * ELO_PERSONAL_POINT_WEIGHT);
const signedElo = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;
const seatNumbers = (items: ContributionItem[]) => {
  const counts = new Map<number, number>();
  for (const item of items) counts.set(item.seat, (counts.get(item.seat) || 0) + 1);
  return [...counts].map(([seat, count]) => `№${seat}${count > 1 ? ` (${count} ${count < 5 ? 'раза' : 'раз'})` : ''}`).join(', ');
};
const group = (label: string, items: ContributionItem[]) => (items.length ? `${label} ${seatNumbers(items)}: ${signedElo(elo(items.reduce((sum, item) => sum + item.points, 0)))}` : null);

/**
 * The breakdown of a seat's contribution in short plain words and Elo (owner, 2026-10-25: «попроще и попонятнее»), one
 * line per kind of action, e.g. «Голосовал в чёрных №10, №1: +4»; caps are shown separately by the game blank.
 */
export function contributionBreakdown(role: StatRole | null, items: ContributionItem[]): string[] {
  const of = (kind: ContributionKind) => items.filter((item) => item.kind === kind);
  const lines = blackRole(role)
    ? [group('Записан красным у', of('named_red')), group('Записан чёрным у', of('named_black')), group('Не записан у', of('not_named'))]
    : [
      group('Голосовал в чёрных', of('found_black')),
      group('Голосовал в уже известных чёрных (без баллов)', of('obvious_black')),
      group('Голосовал в красных', of('vote_red')),
      group('В завещании угадал', of('will_right')),
      group('В завещании ошибся в', of('will_wrong')),
      group('Проверкой нашёл чёрного', of('check_black')),
    ];
  if (of('will_blocked').length) lines.push('Завещание с ошибкой: за верные цвета плюсов нет');
  for (const [kind, label] of [['streak_correct', 'Серия верных решений подряд'], ['streak_wrong', 'Серия ошибок подряд']] as const) {
    const entries = of(kind);
    if (entries.length) lines.push(`${label}: ${signedElo(elo(entries.reduce((sum, item) => sum + item.points, 0)))}`);
  }
  const misses = of('shot_miss');
  if (misses.length) lines.push(`Промахи: ночи ${misses.map((item) => item.night).join(', ')}: ${signedElo(elo(misses.reduce((sum, item) => sum + item.points, 0)))}`);
  return lines.filter((line): line is string => Boolean(line));
}


