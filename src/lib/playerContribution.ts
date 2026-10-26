import { gameActionFacts, redRole, blackRole } from './gameActionFacts.ts';
import type { StatGame, StatRole } from './gameStatistics.ts';
import { sanitizeLiveGameEvents, zeroRoundBreakerSeat } from '../shared/liveGameEvents.ts';
import { normalizeGameRole } from '../shared/gameRoles.ts';
import { ELO_PERSONAL_POINT_WEIGHT } from '../shared/eloWeights.ts';
import { decisionStreakMultipliers, type StreakDecision } from './eloDecisionStreak.ts';
import { missedShotNights, MISSED_SHOT_ELO } from './eloMissPenalty.ts';

/**
 * Individual contribution of a seat in one club game, in the same «points» as the personal game points (1 point = 40 Elo, ELO_PERSONAL_POINT_WEIGHT).
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
 * - a random will guess is worth zero (a «black» mark is right 1 time in 3, a «red» mark 2 times in 3);
 * - a black is judged only by what the dead reds left about him in their wills; votes against a black do not move his points;
 * - owner, 2026-10-26: the don who finds the sheriff with his check on the first night earns +0.2; will colours weigh the
 *   same as votes (a black named right +0.2 like a found black, a wrong colour −0.1 like a vote for a red, a black named red
 *   +0.2).
 */
export const CONTRIBUTION_WEIGHTS = {
  foundBlack: 0.2, voteRed: -0.1, criticalFactor: 2,
  /**
   * Will colours (owner, 2026-10-26: «приравнять к обычным значениям»): a black named right is worth a found black (+8 Elo),
   * any wrong colour costs like a vote for a red (−4), a right red +3. An error still takes away every plus of that will, so
   * marking reds at random does not pay; a red named black whom the table then voted out costs twice («стол сыграл по
   * завещанию»).
   */
  colorRight: { red: 0.075, black: 0.2 }, colorWrong: { calledRed: -0.1, calledBlack: -0.1 }, willFollowedFactor: 2,
  /**
   * The pool (owner, 2026-10-26): a player can find three blacks, +8 each, so all the pluses of one game together are worth at
   * most +24 Elo (votes, will, checks, splits); the series comes on top of the pool. Minuses are counted in full. The ЛХ of the first killed is separate.
   */
  positivePool: 0.6,
  /** Owner, 2026-10-26: the sheriff's black check +4, and +4 more when the table votes that black out — +8 in all, one found black. */
  sheriffFoundBlack: 0.1, sheriffCheckedVotedOut: 0.1,
  /**
   * Owner, 2026-10-26: a black named black in a will −4 (was −8): at most four wills, so with the early exit (−8 for a black
   * voted out at the девятка) the worst a black loses to good red play is −24, the mirror of the red pool.
   */
  blackNamedRed: 0.2, blackNamedBlack: -0.1, blackNotNamed: 0.1, blackOutAtNine: -0.2,
  /**
   * A broken zero-round split (owner, 2026-10-26), by the judge's mark «Кто сломал попил?» and the player voted in the zero
   * round: [breaker, the one it was broken into]. A black into a red: nothing; a black into a black: −24 / +8; a red into a
   * red: −24 / +8; a red into a black: +8 / −16; a black into the sheriff: +16; a red into the sheriff: −24 / +8.
   */
  zeroBreak: {
    blackIntoRed: [0, 0], blackIntoBlack: [-0.6, 0.2], redIntoRed: [-0.6, 0.2], redIntoBlack: [0.2, -0.4],
    blackIntoSheriff: [0.4, 0], redIntoSheriff: [-0.6, 0.2],
  },
  donFoundSheriffFirstNight: 0.2,
  /**
   * A voting tagged «без оценок» (a split): nobody's own read shows, so every red who voted shares only its result. Balanced
   * (owner asked, 2026-10-26): half of a found black (+4 Elo) because the result is shared and agreed; the red side is set so
   * that a split which hits a random candidate is worth zero at a восьмёрка or шестёрка after a miss (a black is about one
   * in three of the players there): +4 × 3/5 ≈ −2.
   */
  splitBlackOut: 0.1, splitRedOut: -0.05,
  /** A vote for a red who left in that very voting costs twice. */
  votedOutRedFactor: 2,
} as const;

export type ContributionKind = 'found_black' | 'obvious_black' | 'vote_red' | 'will_right' | 'will_wrong' | 'check_black' | 'named_red' | 'named_black' | 'not_named' | 'will_blocked' | 'streak_correct' | 'streak_wrong' | 'shot_miss' | 'don_found_sheriff' | 'pool_cap' | 'check_voted_out' | 'out_at_nine' | 'zero_break' | 'zero_broken_into' | 'will_already' | 'split_outcome';
/** One line of the breakdown: what the player did, about which seat, and its points. */
export interface ContributionItem {
  kind: ContributionKind; seat: number; points: number; critical?: boolean; night?: number;
  /** Series lines: which decision in a row (2 or 3 = third and later) and what that decision was. */
  step?: number; source?: ContributionKind;
  /** found_black: the black was never voted out, so the vote earns half; vote_red: that red left in this voting. */
  stayed?: boolean; votedOut?: boolean;
}
/** A run of two or more decisions of the same sign in a row, in game order, with the extra it earned. */
export interface StreakRun { sign: 1 | -1; labels: string[]; points: number }
export interface SeatContribution { seat: number; role: StatRole | null; points: number; items: ContributionItem[]; streaks: StreakRun[] }
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

/**
 * «Без оценок» (owner, 2026-10-26): a tag the judge puts on a voting whose votes say nothing about the voters' own read —
 * usually a split («попил»), often a broken one, where players voted where they were told (`no_scoring` on that voting). Votings are matched by
 * day (protocol day N = engine round N + 1) and their number within the day.
 */
export const unscoredVotings = (protocol: any): Set<string> => {
  const keys = new Set<string>();
  const perDay = new Map<number, Array<{ key: string; round: any }>>();
  const rounds = (Array.isArray(protocol?.votes) ? protocol.votes : []).slice().sort((x: any, y: any) => Number(x?.round_number) - Number(y?.round_number));
  for (const round of rounds) {
    const day = Number(round?.day_number ?? 0);
    const list = perDay.get(day) || [];
    list.push({ key: `${day + 1}:${list.length + 1}`, round });
    perDay.set(day, list);
  }
  for (const [day, list] of perDay) {
    for (const { key, round } of list) if (round?.no_scoring === true) keys.add(key);
    // Owner, 2026-10-26: at a восьмёрка or шестёрка a voting that ends in a revote is a split, and so is the rest of that day.
    const even = [8, 6].includes(Number(list[0]?.round?.eligible_voters));
    if (day > 0 && even && list.some(({ round }) => round?.outcome === 'tie_revote')) for (const { key } of list) keys.add(key);
  }
  return keys;
};

const decisionLabel = (item: ContributionItem) => item.kind === 'found_black' ? `голос в чёрного №${item.seat}`
  : item.kind === 'vote_red' ? `голос в красного №${item.seat}` : item.kind === 'check_black' ? `проверка: чёрный №${item.seat}` : 'завещание';

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
  const splits = unscoredVotings(protocol);
  // Who voted in each tagged voting and who left after it (protocol `eliminated_seats`, so a raise of two counts too).
  const splitResults = [...splits].map((key) => {
    const [round, number] = key.split(':').map(Number);
    const voting = facts.circles.find((circle) => circle.round === round)?.votings.find((item) => item.number === number);
    const protocolRound = (Array.isArray(protocol?.votes) ? protocol.votes : []).slice()
      .sort((x: any, y: any) => Number(x?.round_number) - Number(y?.round_number))
      .filter((item: any) => Number(item?.day_number ?? 0) === round - 1)[number - 1];
    let voters = new Set<number>((voting?.votes || []).flatMap((ballot) => ballot.voters));
    // A revote may be recorded by its totals only; the split is one decision of the day, so use the day's known voters.
    if (!voters.size) voters = new Set((facts.circles.find((circle) => circle.round === round)?.votings || []).flatMap((item) => item.votes.flatMap((ballot) => ballot.voters)));
    const left: number[] = Array.isArray(protocolRound?.eliminated_seats) ? protocolRound.eliminated_seats.map(Number) : [];
    return { voters, left };
  });
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
  // Who was voted out and when; who first named each seat black in a will («первая мысль», owner 2026-10-26).
  const votedOutAt = new Map<number, number>();
  // A cancelled exit («restored») is not an exit: only the effective corrected history counts.
  for (const event of facts.events) {
    if (!event.seat) continue;
    if (event.kind === 'exit' && event.value === 'voted_day') votedOutAt.set(event.seat, event.seq);
    else if (event.kind === 'restored' || (event.kind === 'exit' && event.value !== 'voted_day')) votedOutAt.delete(event.seat);
  }
  const votedOutSeats = new Set<number>(seats.filter((item) => item.exitType === 'voted_day' && (!facts.full || votedOutAt.has(item.seat))).map((item) => item.seat));
  for (const seat of votedOutAt.keys()) votedOutSeats.add(seat);
  // A broken zero-round split: only with the judge's explicit mark of the breaker (never guessed from the votes), and only
  // under the tournament setting, where the player really leaves the table (owner, 2026-10-26; the club setting keeps him).
  const breaker = zeroRoundBreakerSeat(protocol.events);
  const zeroVotedId = String(protocol.zero_round_voted_participant_id || '');
  const victim = zeroVotedId ? Number(results.find((row) => String(row?.participant_id || '') === zeroVotedId)?.seat_number) || null
    : facts.events.filter((event) => event.kind === 'zero_round_voted').at(-1)?.seat ?? null;
  const zeroBreak = new Map<number, ContributionItem>();
  if (protocol.zero_round_rule !== 'club' && breaker && victim && breaker !== victim && roleOf.get(breaker) && roleOf.get(victim)) {
    const into = roleOf.get(victim) === 'sheriff' ? 'Sheriff' : blackRole(roleOf.get(victim)) ? 'Black' : 'Red';
    const [forBreaker, forVictim] = W.zeroBreak[`${blackRole(roleOf.get(breaker)) ? 'black' : 'red'}Into${into}` as keyof typeof W.zeroBreak];
    if (forBreaker) zeroBreak.set(breaker, { kind: 'zero_break', seat: victim, points: forBreaker });
    if (forVictim) zeroBreak.set(victim, { kind: 'zero_broken_into', seat: breaker, points: forVictim });
  }
  // The девятка: a voting with nine players at the table, after the zero circle.
  const outAtNine = (seat: number) => {
    const at = votedOutAt.get(seat);
    const out = at == null ? undefined : facts.events.find((event) => event.seq === at);
    // Players at the table just before that exit (facts.atSeq is taken before each event, cancelled exits restored).
    const alive = out ? facts.atSeq.get(out.seq)?.size : undefined;
    return Boolean(out && out.round > 1 && seats.length === 10 && alive === 9);
  };
  return seats.map((me) => {
    const items: ContributionItem[] = [];
    const streaks: StreakRun[] = [];
    if (redRole(me.role)) {
      const decisions: StreakDecision<ContributionItem>[] = [];
      const found = new Map<number, ContributionItem>();
      const obvious = new Set<number>();
      const isObviousToTable = obviousBlacksFor(me.seat, facts, roleOf);
      // Owner, 2026-10-26: a black the sheriff checked himself is paid by the check (+4) and by the table voting him out (+4);
      // his own vote for that black and naming him in the will earn nothing more. A check at night of a round is known from the
      // next day on.
      const roundOfSeq = new Map(facts.events.map((event) => [event.seq, event.round]));
      const checkedRound = new Map<number, number>();
      if (me.role === 'sheriff') for (const check of facts.checks) if (check.kind === 'sheriff' && blackRole(roleOf.get(check.target))) {
        const round = roundOfSeq.get(check.seq);
        if (round != null && !checkedRound.has(check.target)) checkedRound.set(check.target, round);
      }
      const isObvious = (seat: number, round: number) => isObviousToTable(seat, round) || (checkedRound.has(seat) && checkedRound.get(seat)! < round);
      // Owner, 2026-10-26: in a voting tagged «без оценок» only the colour of whoever left counts — one player or several
      // («с подъёмом») — the same for every red who voted in it.
      for (const split of splitResults) {
        if (!split.voters.has(me.seat)) continue;
        for (const seat of split.left) {
          if (blackRole(roleOf.get(seat))) items.push({ kind: 'split_outcome', seat, points: W.splitBlackOut });
          else if (redRole(roleOf.get(seat))) items.push({ kind: 'split_outcome', seat, points: W.splitRedOut });
        }
      }
      for (const voting of facts.votings.filter((item) => item.outcome === 'single_eliminated' && !splits.has(`${item.round}:${item.number}`))) {
        const target = voting.votes.get(me.seat);
        if (!target) continue;
        const critical = voting.critical === true;
        if (blackRole(roleOf.get(target))) {
          if (isObvious(target, voting.round)) { if (!found.has(target)) obvious.add(target); }
          else if (!found.has(target)) {
            // Owner, 2026-10-26: a vote for a black the table never voted out may be random — it earns half.
            const stayed = !votedOutSeats.has(target);
            const item: ContributionItem = { kind: 'found_black', seat: target, points: stayed ? W.foundBlack / 2 : W.foundBlack, stayed };
            found.set(target, item); obvious.delete(target);
            if (facts.full && voting.seq != null) decisions.push({ seq: voting.seq, sign: 1, items: [item] });
          }
        } else if (redRole(roleOf.get(target))) {
          const votedOut = voting.eliminated === target;
          // Owner, 2026-10-26: a vote for oneself is not punished — unless that very vote decided it against a black: the player
          // left with exactly one vote more than a black candidate, and that one vote was his own (at nine: 4 for him, 4 for a black,
          // his fifth for himself). «Либо своей рукой выводишь мафию, либо себя».
          if (target === me.seat) {
            const counts = new Map<number, number>();
            for (const candidate of voting.votes.values()) counts.set(candidate, (counts.get(candidate) || 0) + 1);
            const mine = counts.get(me.seat) || 0;
            const decided = votedOut && [...counts].some(([seat, count]) => blackRole(roleOf.get(seat)) && count === mine - 1);
            if (!decided) continue;
          }
          const item: ContributionItem = { kind: 'vote_red', seat: target, points: W.voteRed * (critical ? W.criticalFactor : 1) * (votedOut ? W.votedOutRedFactor : 1), critical, votedOut };
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
        // Owner, 2026-10-26: a black this red already found with his vote earns once — the will does not pay for him again.
        if (blackRole(roleOf.get(seat))) will.push(found.has(seat) || checkedRound.has(seat) ? { kind: 'will_already', seat, points: 0 } : { kind: 'will_right', seat, points: W.colorRight.black });
        else if (redRole(roleOf.get(seat))) {
          // Owner, 2026-10-26: when the table then voted this red out, it played by the will — the error costs twice.
          const out = votedOutAt.get(seat); const willAt = killedEvent(me.seat)?.seq;
          const followed = facts.full && out != null && willAt != null && out > willAt;
          will.push({ kind: 'will_wrong', seat, points: W.colorWrong.calledBlack * (followed ? W.willFollowedFactor : 1), votedOut: followed });
        }
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
          // A repeated check of the same black pays nothing again (+4 and +4 per black in all).
          if (checkedTargets.has(check.target)) continue;
          const item: ContributionItem = { kind: 'check_black', seat: check.target, points: W.sheriffFoundBlack };
          items.push(item);
          if (votedOutSeats.has(check.target)) items.push({ kind: 'check_voted_out', seat: check.target, points: W.sheriffCheckedVotedOut });
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
      const factors = firstKilled ? new Map<ContributionItem, number>() : decisionStreakMultipliers(decisions);
      for (const [item, factor] of factors) {
        const extra = item.points * (factor - 1);
        if (Math.abs(extra) > 1e-10) items.push({ kind: extra > 0 ? 'streak_correct' : 'streak_wrong', seat: item.seat, points: extra, step: factor >= 1.5 ? 3 : 2, source: item.kind });
      }
      // The runs themselves, for the game blank: which decisions came in a row (owner, 2026-10-26).
      if (!firstKilled) {
        let run: StreakRun | null = null;
        const close = () => { if (run && run.labels.length >= 2 && Math.abs(run.points) > 1e-10) streaks.push(run); run = null; };
        for (const decision of [...decisions].sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity))) {
          if (!decision.items.length) continue;
          if (decision.seq === null || !run || run.sign !== decision.sign) { close(); run = { sign: decision.sign, labels: [], points: 0 }; }
          run!.labels.push(decisionLabel(decision.items[0]));
          for (const item of decision.items) run!.points += item.points * ((factors.get(item) ?? 1) - 1);
        }
        close();
      }
    } else if (blackRole(me.role)) {
      if (outAtNine(me.seat)) items.push({ kind: 'out_at_nine', seat: me.seat, points: W.blackOutAtNine });
      for (const night of missedShotNights(protocol, me.seat)) items.push({ kind: 'shot_miss', seat: me.seat, night, points: -MISSED_SHOT_ELO / ELO_PERSONAL_POINT_WEIGHT });
      if (me.role === 'don') {
        const roundOfSeq = new Map(facts.events.map((event) => [event.seq, event.round]));
        const found = facts.checks.find((check) => check.kind === 'don' && roleOf.get(check.target) === 'sheriff' && roundOfSeq.get(check.seq) === 1);
        if (found) items.push({ kind: 'don_found_sheriff', seat: found.target, points: W.donFoundSheriffFirstNight });
      }
      for (const other of seats.filter((item) => redRole(item.role) && item.colors.length)) {
        const colors = colorsBySeat.get(other.seat)!;
        if ((other.exitType !== 'killed' && !killedEvent(other.seat)) || !colors.mentioned.size
          || colors.conflicts.has(me.seat) || !wasAliveForWill(me, other)) continue;
        if (colors.red.has(me.seat) || colors.sheriff.has(me.seat)) items.push({ kind: 'named_red', seat: other.seat, points: W.blackNamedRed });
        else if (colors.black.has(me.seat)) items.push({ kind: 'named_black', seat: other.seat, points: W.blackNamedBlack });
        else items.push({ kind: 'not_named', seat: other.seat, points: W.blackNotNamed });
      }
    }
    // Owner, 2026-10-26: the series may go over the pool — that is its point.
    if (zeroBreak.has(me.seat)) items.push(zeroBreak.get(me.seat)!);
    const pluses = items.reduce((sum, item) => sum + (item.kind === 'streak_correct' ? 0 : Math.max(0, item.points)), 0);
    if (pluses > W.positivePool + 1e-10) items.push({ kind: 'pool_cap', seat: me.seat, points: W.positivePool - pluses });
    const points = items.reduce((sum, item) => sum + item.points, 0);
    return { seat: me.seat, role: me.role, points, items, streaks };
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
export function contributionBreakdown(role: StatRole | null, items: ContributionItem[], streaks: StreakRun[] = []): string[] {
  const of = (kind: ContributionKind) => items.filter((item) => item.kind === kind);
  const lines = blackRole(role)
    ? [of('out_at_nine').length ? `Ушёл на девятке: ${signedElo(elo(of('out_at_nine')[0].points))}` : null, group('Проверкой в первую ночь нашёл шерифа', of('don_found_sheriff')), group('Записан красным у', of('named_red')), group('Записан чёрным у', of('named_black')), group('Не записан у', of('not_named'))]
    : [
      group('Попил, ушёл чёрный', of('split_outcome').filter((item) => item.points > 0)),
      group('Попил, ушёл красный', of('split_outcome').filter((item) => item.points < 0)),
      group('Голосовал в чёрных', of('found_black').filter((item) => !item.stayed)),
      group('Голосовал в чёрных, которых не вывели (половина)', of('found_black').filter((item) => item.stayed)),
      of('obvious_black').length ? `Голосовал в уже известных чёрных ${seatNumbers(of('obvious_black'))} — без баллов` : null,
      group('Голосовал в красных', of('vote_red').filter((item) => !item.votedOut)),
      group('Голосовал в красных, которых вывели (×2)', of('vote_red').filter((item) => item.votedOut)),
      group('В завещании угадал', of('will_right')),
      of('will_already').length ? `В завещании снова назвал ${seatNumbers(of('will_already'))} — уже засчитан` : null,
      group('В завещании ошибся в', of('will_wrong').filter((item) => !item.votedOut)),
      group('В завещании назвал чёрным красного, стол его вывел (×2)', of('will_wrong').filter((item) => item.votedOut)),
      group('Проверкой нашёл чёрного', of('check_black')),
      group('Проверенного чёрного вывел стол', of('check_voted_out')),
    ];
  for (const item of of('zero_break')) lines.unshift(`Сломал попил в нуле в №${item.seat}: ${signedElo(elo(item.points))}`);
  for (const item of of('zero_broken_into')) lines.unshift(`В нуле в него сломал попил №${item.seat}: ${signedElo(elo(item.points))}`);
  if (of('will_blocked').length) lines.push('Завещание с ошибкой: за верные цвета плюсов нет');
  // The series in plain words: which decisions came in a row and what the run added (owner, 2026-10-26).
  for (const run of streaks) {
    lines.push(`${run.sign > 0 ? 'Верно подряд' : 'Ошибки подряд'}: ${run.labels.join(' → ')}: ${signedElo(elo(run.points))}`);
  }
  const pool = of('pool_cap');
  if (pool.length) lines.push(`Больше +${elo(CONTRIBUTION_WEIGHTS.positivePool)} за игру не набрать: ${signedElo(elo(pool[0].points))}`);
  const misses = of('shot_miss');
  if (misses.length) lines.push(`Промахи: ночи ${misses.map((item) => item.night).join(', ')}: ${signedElo(elo(misses.reduce((sum, item) => sum + item.points, 0)))}`);
  return lines.filter((line): line is string => Boolean(line));
}


