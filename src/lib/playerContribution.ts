import { finalRevealsOfEvents } from './revealStats.ts';
import { gameActionFacts, redRole, blackRole } from './gameActionFacts.ts';
import type { StatGame, StatRole } from './gameStatistics.ts';
import { ELO_TAGS, eloTagMarks, sanitizeLiveGameEvents, splitBreakMarks, zeroRoundBreakerSeat } from '../shared/liveGameEvents.ts';
import { normalizeGameRole } from '../shared/gameRoles.ts';
import { ELO_PERSONAL_POINT_WEIGHT } from '../shared/eloWeights.ts';
import { decisionStreakSteps, type StreakDecision } from './eloDecisionStreak.ts';
import { missedShotNights, MISSED_SHOT_ELO, SPLIT_BREAK_RED_ELO, RAISE_DEFEAT_ELO, RAISE_DEFEAT_BLACK_BONUS_ELO } from './eloMissPenalty.ts';
import { allocateFindCredit, bestMoveBlackCredits, type FindCreditCandidate } from './eloFindCredit.ts';

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
   * any wrong colour costs like a vote for a red (−4), a right red +2. An error still takes away every plus of that will, so
   * marking reds at random does not pay; a red named black whom the table then voted out costs twice («стол сыграл по
   * завещанию»).
   */
  colorRight: { red: 0.05, black: 0.2 }, colorWrong: { calledRed: -0.1, calledBlack: -0.1 }, willFollowedFactor: 2,
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
  blackNamedRed: 0.2, blackNamedBlack: -0.1, blackNotNamed: 0.1, blackOutAtNine: -0.1, blackCheckedFirstNight: -0.1,
  /** Owner, 2026-11-02: a black earns +2 Elo for every day circle in which nobody voted for him (he sat at the table all of it). */
  blackUnvotedRound: 2 / ELO_PERSONAL_POINT_WEIGHT,
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

export type ContributionKind = 'found_black' | 'obvious_black' | 'vote_red' | 'will_right' | 'will_wrong' | 'will_vote_relief' | 'check_black' | 'named_red' | 'named_black' | 'not_named' | 'will_blocked' | 'streak_correct' | 'streak_wrong' | 'shot_miss' | 'split_break_red' | 'elo_tag_false_sheriff_red_sheriff' | 'elo_tag_revealed_to_black' | 'elo_tag_killed_sheriff_zero' | 'raise_defeat' | 'raise_defeat_black' | 'don_found_sheriff' | 'pool_cap' | 'check_voted_out' | 'black_checked_first_night' | 'out_at_nine' | 'zero_break' | 'zero_broken_into' | 'will_already' | 'split_outcome' | 'unvoted_round';
/** One line of the breakdown: what the player did, about which seat, and its points. */
export interface ContributionItem {
  kind: ContributionKind; seat: number; points: number; critical?: boolean; night?: number; round?: number;
  /** Series lines: which decision in a row and what that decision was. */
  step?: number; source?: ContributionKind;
  /** found_black: the black was never voted out, so the vote earns half; vote_red: that red left in this voting. */
  stayed?: boolean; votedOut?: boolean;
  firstKilledWill?: boolean;
  /** Number of players alive at this vote, for labels such as «пятёрка». */
  tableSize?: number;
  willSeriesExtra?: number;
  willAuthors?: number[];
  willColor?: 'red' | 'black' | 'sheriff';
}
/** A run of two or more decisions of the same sign in a row, in game order, with the extra it earned. */
export interface StreakRun { sign: 1 | -1; labels: string[]; points: number }
export interface SeatContribution {
  seat: number; role: StatRole | null; points: number; positivePoints: number; negativePoints: number;
  /** Fixed responsibility deduction, outside the personal floor/cap. */
  missPenaltyElo: number; items: ContributionItem[]; streaks: StreakRun[];
}
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

export function gameContribution(envelope: any, mode: 'club' | 'wills' = 'club'): SeatContribution[] {
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
    return { voters, left, round };
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
  // A contradictory colour about the same target resets its will streak; omitted targets are neutral.
  const willHistory = new Map<number, Array<{ author: number; seq: number; wrong: boolean; authors: number[] }>>();
  const criticalRounds = new Set(facts.votings.filter((vote) => vote.critical).map((vote) => vote.round));
  if (mode === 'club' && facts.full) {
    for (const death of [...deaths.values()].sort((a, b) => a.seq - b.seq)) {
      if (!death.seat || !redRole(roleOf.get(death.seat))) continue;
      const colors = colorsBySeat.get(death.seat);
      if (!colors) continue;
      for (const target of colors.mentioned) {
        if (!redRole(roleOf.get(target)) || !facts.atSeq.get(death.seq)?.has(target)) continue;
        const history = willHistory.get(target) ?? [];
        const wrong = colors.black.has(target);
        const authors = wrong ? [...(history.at(-1)?.authors ?? []), death.seat] : [];
        history.push({ author: death.seat, seq: death.seq, wrong, authors });
        willHistory.set(target, history);
      }
    }
  }
  // A broken zero-round split: only with the judge's explicit mark of the breaker (never guessed from the votes), and only
  // under the tournament setting, where the player really leaves the table (owner, 2026-10-26; the club setting keeps him).
  const breaker = zeroRoundBreakerSeat(protocol.events);
  const zeroVotedId = String(protocol.zero_round_voted_participant_id || '');
  const victim = zeroVotedId ? Number(results.find((row) => String(row?.participant_id || '') === zeroVotedId)?.seat_number) || null
    : facts.events.filter((event) => event.kind === 'zero_round_voted').at(-1)?.seat ?? null;
  const zeroBreak = new Map<number, ContributionItem>();
  // Reds the judge tagged «сломал попил красным» (a deliberate harmful break) on ANY circle, the zero one included; each costs a fixed Elo
  // cut on top of the zero-circle table, which keeps paying the plain «who broke it» mark.
  const redSplitBreaks: Array<{ seat: number; round: number }> = [];
  for (const mark of splitBreakMarks(protocol.events)) if (redRole(roleOf.get(mark.seat))) redSplitBreaks.push(mark);
  // The last raise before the end of a game the reds lost: each red who raised a hand for it is cut (only where the hands were recorded).
  const raiseVoters = new Set<number>();
  let raiseRound: number | undefined;
  let raiseTable: ReadonlySet<number> | undefined;
  if (protocol.winner_team === 'black') {
    const voteRounds = Array.isArray(protocol?.votes) ? protocol.votes : [];
    const raised = voteRounds.filter((round: any) => round?.outcome === 'all_tied_eliminated' && (round?.eliminated_seats || []).length >= 2);
    const lastRaise = raised.sort((x: any, y: any) => Number(y.day_number ?? 0) - Number(x.day_number ?? 0) || Number(y.round_number) - Number(x.round_number))[0];
    const lastDay = voteRounds.reduce((max: number, round: any) => Math.max(max, Number(round?.day_number ?? 0)), 0);
    if (lastRaise && Number(lastRaise.day_number ?? 0) === lastDay) {
      const handsRound = Number(lastRaise.day_number ?? 0) + 1;
      raiseRound = handsRound;
      for (const event of facts.events) {
        if (event.round !== handsRound || !event.seat) continue;
        if (event.kind === 'table_vote') { if (!raiseVoters.size && raiseTable === undefined) raiseTable = facts.atSeq.get(event.seq); raiseVoters.add(event.seat); }
        else if (event.kind === 'table_vote_removed') raiseVoters.delete(event.seat);
      }
    }
  }
  const redRaiseVoters = [...raiseVoters].filter((seat) => redRole(roleOf.get(seat)));
  if (protocol.zero_round_rule !== 'club' && breaker && victim && breaker !== victim && roleOf.get(breaker) && roleOf.get(victim)) {
    const into = roleOf.get(victim) === 'sheriff' ? 'Sheriff' : blackRole(roleOf.get(victim)) ? 'Black' : 'Red';
    const [forBreaker, forVictim] = W.zeroBreak[`${blackRole(roleOf.get(breaker)) ? 'black' : 'red'}Into${into}` as keyof typeof W.zeroBreak];
    if (forBreaker) zeroBreak.set(breaker, { kind: 'zero_break', round: 1, seat: victim, points: forBreaker });
    if (forVictim) zeroBreak.set(victim, { kind: 'zero_broken_into', round: 1, seat: breaker, points: forVictim });
  }
  // The девятка: a voting with nine players at the table, after the zero circle.
  const outAtNine = (seat: number) => {
    const at = votedOutAt.get(seat);
    const out = at == null ? undefined : facts.events.find((event) => event.seq === at);
    // Players at the table just before that exit (facts.atSeq is taken before each event, cancelled exits restored).
    const alive = out ? facts.atSeq.get(out.seq)?.size : undefined;
    return Boolean(out && out.round > 1 && seats.length === 10 && alive === 9);
  };
  const reveals = finalRevealsOfEvents(facts.events);
  const firstNightSequences = new Set(facts.events.filter((event) => event.round === 1).map((event) => event.seq));
  const firstNightSheriffTargets = new Set(facts.checks
    .filter((check) => check.kind === 'sheriff' && firstNightSequences.has(check.seq))
    .map((check) => check.target));
  return seats.map((me) => {
    const items: ContributionItem[] = [];
    const streaks: StreakRun[] = [];
    if (redRole(me.role)) {
      const decisions: StreakDecision<ContributionItem>[] = [];
      const finds: FindCreditCandidate<ContributionItem>[] = [];
      const participantId = String(results.find((row) => Number(row?.seat_number) === me.seat)?.participant_id || '');
      const found = new Map<number, ContributionItem>();
      const obvious = new Map<number, number>();
      const isObviousToTable = obviousBlacksFor(me.seat, facts, roleOf);
      // Owner, 2026-10-26: a black the sheriff checked himself is paid by the check (+4) and by the table voting him out (+4);
      // his own vote for that black and naming him in the will earn nothing more. A check at night of a round is known from the
      // next day on.
      const roundOfSeq = new Map(facts.events.map((event) => [event.seq, event.round]));
      const checkedRound = new Map<number, number>();
      if (mode === 'club' && me.role === 'sheriff') for (const check of facts.checks) if (check.kind === 'sheriff' && blackRole(roleOf.get(check.target))) {
        const round = roundOfSeq.get(check.seq);
        if (round != null && !checkedRound.has(check.target)) checkedRound.set(check.target, round);
      }
      const isObvious = (seat: number, round: number) => isObviousToTable(seat, round) || (checkedRound.has(seat) && checkedRound.get(seat)! < round);
      // Owner, 2026-10-26: in a voting tagged «без оценок» only the colour of whoever left counts — one player or several
      // («с подъёмом») — the same for every red who voted in it.
      for (const split of mode === 'club' ? splitResults : []) {
        if (!split.voters.has(me.seat)) continue;
        for (const seat of split.left) {
          if (blackRole(roleOf.get(seat))) {
            // Owner, 2026-11-02: a black who left by a split is the same «заголосованный чёрный» as any other — one credit slot per black
            // (8 Elo at most), shared with the check, the vote and the will. It used to be added on top (+12 for a checked black).
            const out: ContributionItem = { kind: 'split_outcome', seat, round: split.round, points: W.splitBlackOut };
            items.push(out);
            finds.push({ item: out, target: seat, value: W.splitBlackOut, seq: votedOutAt.get(seat) ?? null, ownDecision: false });
          }
          else if (redRole(roleOf.get(seat))) items.push({ kind: 'split_outcome', seat, round: split.round, points: W.splitRedOut });
        }
      }
      const voteReliefs = new Map<ContributionItem, number[]>();
      for (const voting of mode === 'club' ? facts.votings.filter((item) => item.outcome === 'single_eliminated' && !splits.has(`${item.round}:${item.number}`)) : []) {
        const target = voting.votes.get(me.seat);
        if (!target) continue;
        const critical = voting.critical === true;
        if (blackRole(roleOf.get(target))) {
          if (isObvious(target, voting.round)) { if (!found.has(target)) obvious.set(target, voting.round); }
          else if (!found.has(target)) {
            // Owner, 2026-10-26: a vote for a black the table never voted out may be random — it earns half.
            const stayed = !votedOutSeats.has(target);
            const item: ContributionItem = { kind: 'found_black', seat: target, round: voting.round, points: stayed ? W.foundBlack / 2 : W.foundBlack, stayed };
            found.set(target, item); obvious.delete(target);
            finds.push({ item, target, value: item.points, seq: voting.seq ?? null, ownDecision: true });
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
          const item: ContributionItem = { kind: 'vote_red', seat: target, round: voting.round, tableSize: voting.alive?.size, points: W.voteRed * (critical ? W.criticalFactor : 1) * (votedOut ? W.votedOutRedFactor : 1), critical, votedOut };
          items.push(item);
          if (target !== me.seat && voting.seq != null) {
            const authors = willHistory.get(target)?.filter((entry) => entry.seq < voting.seq!).at(-1)?.authors;
            if (authors && authors.length > 1) voteReliefs.set(item, authors);
          }
          // Preserve existing base scoring; a self-vote does not establish a colour-reading streak.
          if (target !== me.seat && facts.full && voting.seq != null) decisions.push({ seq: voting.seq, sign: -1, items: [item] });
        }
      }
      items.push(...found.values());
      for (const [seat, round] of obvious) items.push({ kind: 'obvious_black', seat, round, points: 0 });
      const will: ContributionItem[] = [];
      for (const seat of colorsBySeat.get(me.seat)!.red) {
        if (redRole(roleOf.get(seat))) will.push({ kind: 'will_right', seat, willColor: 'red', points: W.colorRight.red });
        else if (blackRole(roleOf.get(seat))) will.push({ kind: 'will_wrong', seat, willColor: 'red', points: W.colorWrong.calledRed });
      }
      for (const seat of colorsBySeat.get(me.seat)!.black) {
        // Owner, 2026-10-26: a black this red already found with his vote earns once — the will does not pay for him again.
        if (blackRole(roleOf.get(seat))) will.push(checkedRound.has(seat) ? { kind: 'will_already', seat, points: 0 } : { kind: 'will_right', seat, willColor: 'black', points: W.colorRight.black });
        else if (redRole(roleOf.get(seat))) {
          // Owner, 2026-10-26: when the table then voted this red out, it played by the will — the error costs twice.
          const out = votedOutAt.get(seat); const willAt = killedEvent(me.seat)?.seq;
          const followed = facts.full && out != null && willAt != null && out > willAt;
          const series = willHistory.get(seat)?.find((entry) => entry.author === me.seat && entry.wrong);
          const willSeriesExtra = -Math.max(0, (series?.authors.length ?? 1) - 1) * 2 / ELO_PERSONAL_POINT_WEIGHT;
          const critical = series != null && criticalRounds.has((killedEvent(me.seat)?.round ?? -2) + 1);
          const points = (W.colorWrong.calledBlack * (followed ? W.willFollowedFactor : 1) + willSeriesExtra)
            * (critical ? W.criticalFactor : 1);
          will.push({ kind: 'will_wrong', seat, willColor: 'black', points, votedOut: followed, willSeriesExtra, critical });
        }
      }
      // A sheriff label on a black is still a wrong red colour; compatible red+sheriff labels count once.
      for (const seat of colorsBySeat.get(me.seat)!.sheriff) {
        if (!colorsBySeat.get(me.seat)!.red.has(seat) && blackRole(roleOf.get(seat))) will.push({ kind: 'will_wrong', seat, willColor: 'sheriff', points: W.colorWrong.calledRed });
      }
      const result = results.find((row) => Number(row?.seat_number) === me.seat);
      const markedFirstKilled = String(protocol.first_killed_participant_id || '') === String(result?.participant_id || '')
        && Boolean(protocol.first_killed_participant_id);
      const firstKilledSeat = facts.events.filter((event) => event.kind === 'first_killed').at(-1)?.seat;
      const firstKilled = Object.hasOwn(protocol, 'first_killed_participant_id') ? markedFirstKilled : firstKilledSeat === me.seat;
      for (const item of will) {
        item.round = killedEvent(me.seat)?.round;
        item.firstKilledWill = firstKilled;
      }
      const wrong = will.filter((item) => item.kind === 'will_wrong');
      const right = will.filter((item) => item.kind === 'will_right');
      if (wrong.length && !firstKilled) {
        items.push(...wrong);
        if (right.length) items.push({ kind: 'will_blocked', seat: me.seat, round: killedEvent(me.seat)?.round, points: 0 });
      } else items.push(...will);
      if (mode === 'club' && me.role === 'sheriff') {
        const checkedTargets = new Set<number>();
        for (const check of facts.checks) if (check.kind === 'sheriff' && blackRole(roleOf.get(check.target))) {
          // A repeated check of the same black pays nothing again (+4 and +4 per black in all).
          if (checkedTargets.has(check.target)) continue;
          const item: ContributionItem = { kind: 'check_black', seat: check.target, round: roundOfSeq.get(check.seq), points: W.sheriffFoundBlack };
          items.push(item);
          finds.push({ item, target: check.target, value: W.sheriffFoundBlack, seq: check.seq, ownDecision: true });
          if (votedOutSeats.has(check.target)) {
            const out: ContributionItem = { kind: 'check_voted_out', seat: check.target, round: roundOfSeq.get(votedOutAt.get(check.target) ?? -1), points: W.sheriffCheckedVotedOut };
            items.push(out);
            finds.push({ item: out, target: check.target, value: W.sheriffFoundBlack + W.sheriffCheckedVotedOut, seq: votedOutAt.get(check.target) ?? null, ownDecision: false });
          }
          if (facts.full && !checkedTargets.has(check.target)) decisions.push({ seq: check.seq, sign: 1, items: [item] });
          checkedTargets.add(check.target);
        }
      }
      const willSeq = facts.full ? killedEvent(me.seat)?.seq ?? null : null;
      for (const item of right) if (items.includes(item) && blackRole(roleOf.get(item.seat))) {
        finds.push({ item, target: item.seat, value: item.points, seq: killedEvent(me.seat)?.seq ?? null, ownDecision: true });
      }
      // One will is a simultaneous batch. Mixed PU evidence keeps its base positives, but cannot
      // borrow an arbitrary mark order to extend a cross-action streak.
      if ((!wrong.length || firstKilled) && right.length) decisions.push({ seq: wrong.length ? null : willSeq, sign: 1, items: right });
      if (wrong.length) decisions.push({ seq: firstKilled && right.length ? null : willSeq, sign: -1, items: wrong });
      const priorCredit = bestMoveBlackCredits(protocol, participantId, results);
      // A recorded sheriff check and the subsequent elimination earn their own credit.
      for (const { item, target } of finds) {
        if (item.kind === 'check_black') priorCredit.delete(target);
      }
      const credit = allocateFindCredit(finds, priorCredit);
      for (const [item, value] of credit.awards) {
        item.points = value;
        if (value < 1e-10 && item.kind === 'will_right') item.kind = 'will_already';
      }
      // Top-ups preserve base credit but repeating the same find cannot extend or amplify the series.
      const seriesDecisions = decisions.map((decision) => ({ ...decision, items: decision.items.filter((item) => item.points < 0 || (!credit.awards.has(item) && item.points > 0) || credit.newDecisions.has(item)) }));
      // Owner, 2026-10-26: the first killed is rated by his best move and his will, without a series bonus.
      const steps = firstKilled ? new Map<ContributionItem, number>() : decisionStreakSteps(seriesDecisions);
      const extraByItem = new Map<ContributionItem, number>();
      for (const [item, step] of steps) {
        if (step === 1) continue;
        const sign = Math.sign(item.points);
        const criticalFactor = item.critical ? W.criticalFactor : 1;
        const extra = sign * (step - 1) * 2 * criticalFactor / ELO_PERSONAL_POINT_WEIGHT;
        extraByItem.set(item, extra);
        items.push({ kind: extra > 0 ? 'streak_correct' : 'streak_wrong', seat: item.seat, points: extra, round: item.round, step, source: item.kind, critical: item.critical });
      }
      for (const [vote, authors] of voteReliefs) {
        const factor = vote.critical ? W.criticalFactor : 1;
        const relief = (authors.length - 1) * 2 * factor / ELO_PERSONAL_POINT_WEIGHT;
        const points = Math.min(relief, -(vote.points + (extraByItem.get(vote) ?? 0)));
        if (points > 0) items.push({ kind: 'will_vote_relief', seat: vote.seat, round: vote.round, points, critical: vote.critical, willAuthors: authors });
      }
      // The runs themselves, for the game blank: which decisions came in a row (owner, 2026-10-26).
      if (!firstKilled) {
        let run: StreakRun | null = null;
        const close = () => { if (run && run.labels.length >= 2 && Math.abs(run.points) > 1e-10) streaks.push(run); run = null; };
        for (const decision of [...seriesDecisions].sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity))) {
          if (!decision.items.length) continue;
          if (decision.seq === null || !run || run.sign !== decision.sign) { close(); run = { sign: decision.sign, labels: [], points: 0 }; }
          run!.labels.push(decisionLabel(decision.items[0]));
          for (const item of decision.items) run!.points += extraByItem.get(item) ?? 0;
        }
        close();
      }
    } else if (blackRole(me.role)) {
      if (mode === 'club' && firstNightSheriffTargets.has(me.seat) && !reveals.has(me.seat)) {
        items.push({ kind: 'black_checked_first_night', seat: me.seat, round: 1, points: W.blackCheckedFirstNight });
      }
      if (mode === 'club' && outAtNine(me.seat)) items.push({ kind: 'out_at_nine', seat: me.seat, round: facts.events.find((event) => event.seq === votedOutAt.get(me.seat))?.round, points: W.blackOutAtNine });
      if (mode === 'club') {
        // Day circles the facts keep (after the zero circle, one player left): any ballot for this black in any of its votings spoils it.
        const rounds = new Map<number, boolean>();
        for (const voting of facts.votings) {
          if (!voting.alive?.has(me.seat)) continue;
          const spoiled = [...voting.votes.values()].includes(me.seat);
          rounds.set(voting.round, (rounds.get(voting.round) ?? false) || spoiled);
        }
        for (const [round, spoiled] of rounds) if (!spoiled) items.push({ kind: 'unvoted_round', seat: me.seat, night: round, points: W.blackUnvotedRound });
      }
      for (const night of missedShotNights(protocol, me.seat)) items.push({ kind: 'shot_miss', seat: me.seat, night, points: -MISSED_SHOT_ELO / ELO_PERSONAL_POINT_WEIGHT });
      if (mode === 'club' && me.role === 'don') {
        const roundOfSeq = new Map(facts.events.map((event) => [event.seq, event.round]));
        const found = facts.checks.find((check) => check.kind === 'don' && roleOf.get(check.target) === 'sheriff' && roundOfSeq.get(check.seq) === 1);
        if (found) items.push({ kind: 'don_found_sheriff', seat: found.target, round: 1, points: W.donFoundSheriffFirstNight });
      }
      for (const other of seats.filter((item) => redRole(item.role) && item.colors.length)) {
        const colors = colorsBySeat.get(other.seat)!;
        if ((other.exitType !== 'killed' && !killedEvent(other.seat)) || !colors.mentioned.size
          || colors.conflicts.has(me.seat) || !wasAliveForWill(me, other)) continue;
        if (colors.red.has(me.seat) || colors.sheriff.has(me.seat)) items.push({ kind: 'named_red', seat: other.seat, round: killedEvent(other.seat)?.round, points: W.blackNamedRed });
        else if (colors.black.has(me.seat)) items.push({ kind: 'named_black', seat: other.seat, round: killedEvent(other.seat)?.round, points: W.blackNamedBlack });
        else {
          const death = killedEvent(other.seat);
          const alreadyChecked = mode === 'club' && other.role === 'sheriff' && facts.checks.some((check) =>
            check.kind === 'sheriff' && check.target === me.seat && (!death || check.seq < death.seq));
          if (!alreadyChecked) items.push({ kind: 'not_named', seat: other.seat, round: death?.round, points: W.blackNotNamed });
        }
      }
    }
    // Elo tags of the judge (owner, 2026-11-03): fixed −10 / +10 after every personal limit, any role.
    if (mode === 'club') {
      for (const mark of eloTagMarks(protocol.events).filter((entry) => entry.seat === me.seat)) {
        items.push({ kind: `elo_tag_${mark.tag}` as ContributionKind, seat: me.seat, night: mark.round, points: ELO_TAGS[mark.tag].elo / ELO_PERSONAL_POINT_WEIGHT });
      }
    }
    if (mode === 'club' && redRole(me.role)) {
      for (const mark of redSplitBreaks.filter((entry) => entry.seat === me.seat)) items.push({ kind: 'split_break_red', seat: me.seat, night: mark.round, points: -SPLIT_BREAK_RED_ELO / ELO_PERSONAL_POINT_WEIGHT });
      if (raiseVoters.has(me.seat)) items.push({ kind: 'raise_defeat', seat: me.seat, round: raiseRound, points: -RAISE_DEFEAT_ELO / ELO_PERSONAL_POINT_WEIGHT });
    }
    // The blacks who sat at the table during that raise are paid +10 Elo (owner, 2026-11-01), only when red hands were really recorded.
    if (mode === 'club' && blackRole(me.role) && redRaiseVoters.length && (raiseTable ? raiseTable.has(me.seat) : me.exitType === 'alive')) {
      items.push({ kind: 'raise_defeat_black', seat: me.seat, round: raiseRound, points: RAISE_DEFEAT_BLACK_BONUS_ELO / ELO_PERSONAL_POINT_WEIGHT });
    }
    // Owner, 2026-10-26: the series may go over the pool — that is its point.
    if (mode === 'club' && zeroBreak.has(me.seat)) items.push(zeroBreak.get(me.seat)!);
    const fixedTag = (item: ContributionItem) => item.kind === 'elo_tag_false_sheriff_red_sheriff' || item.kind === 'elo_tag_revealed_to_black' || item.kind === 'elo_tag_killed_sheriff_zero';
    const pluses = items.reduce((sum, item) => sum + (item.kind === 'streak_correct' || item.kind === 'will_vote_relief' || fixedTag(item) ? 0 : Math.max(0, item.points)), 0);
    if (pluses > W.positivePool + 1e-10) items.push({ kind: 'pool_cap', seat: me.seat, points: W.positivePool - pluses });
    const positivePoints = Math.min(W.positivePool, pluses) + items.filter((item) => item.kind === 'streak_correct').reduce((sum, item) => sum + item.points, 0);
    const negativePoints = items.filter((item) => item.points < 0 && item.kind !== 'pool_cap' && item.kind !== 'shot_miss' && item.kind !== 'split_break_red' && item.kind !== 'raise_defeat' && !fixedTag(item)).reduce((sum, item) => sum + item.points, 0);
    const willRelief = items.filter((item) => item.kind === 'will_vote_relief').reduce((sum, item) => sum + item.points, 0);
    // Fixed cuts after all personal limits: a miss, a red who broke a split, a red who raised for the lost game.
    const missPenaltyElo = items.filter((item) => item.kind === 'shot_miss').length * MISSED_SHOT_ELO
      + items.filter((item) => item.kind === 'split_break_red').length * SPLIT_BREAK_RED_ELO
      + items.filter((item) => item.kind === 'raise_defeat').length * RAISE_DEFEAT_ELO
      - items.filter(fixedTag).reduce((sum, item) => sum + item.points * ELO_PERSONAL_POINT_WEIGHT, 0);
    return { seat: me.seat, role: me.role, points: positivePoints + negativePoints + willRelief, positivePoints, negativePoints: negativePoints + willRelief, missPenaltyElo, items, streaks };
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
 * Show the arithmetic of each mistaken red decision in the same order as it is charged:
 * base colour mistake (+ elimination factor), streak, then critical ×2.
 * The streak items are bookkeeping and must not look like another separate penalty.
 */
export const mistakeLines = (items: ContributionItem[], kind: 'vote_red' | 'will_wrong', includeCircle = true): string[] => {
  return items.filter((item) => item.kind === kind).map((item) => {
    const multiplier = item.critical ? CONTRIBUTION_WEIGHTS.criticalFactor : 1;
    const base = item.points / multiplier - (kind === 'will_wrong' ? item.willSeriesExtra ?? 0 : 0);
    const ownSeries = kind === 'will_wrong' ? item.willSeriesExtra ?? 0 : 0;
    const streak = items.filter((part) => part.kind === 'streak_wrong' && part.source === kind && part.seat === item.seat && part.round === item.round)
      .reduce((sum, part) => sum + part.points, 0) / multiplier;
    const relief = kind === 'vote_red' ? items.filter((part) => part.kind === 'will_vote_relief' && part.seat === item.seat && part.round === item.round)
      .reduce((sum, part) => sum + part.points, 0) / multiplier : 0;
    const beforeCritical = base + ownSeries + streak + relief;
    const total = beforeCritical * multiplier;
    const tableNames: Record<number, string> = { 9: 'Девятка', 7: 'Семёрка', 5: 'Пятёрка', 3: 'Тройка' };
    const circle = item.tableSize && tableNames[item.tableSize] ? tableNames[item.tableSize] : item.round != null ? `Круг ${item.round}` : '';
    const context = includeCircle && circle ? `${circle} · ` : '';
    const action = kind === 'vote_red'
      ? `Голос в красного №${item.seat}${item.votedOut ? ', которого вывели' : ''}`
      : `Завещание: назвал №${item.seat} чёрным${item.votedOut ? ', стол вывел красного' : ''}`;
    const components = [`${signedElo(elo(base))} за ${kind === 'vote_red' ? 'голос' : 'завещание'}`];
    if (ownSeries) components.push(`${signedElo(elo(ownSeries))} за повтор ошибочного завещания`);
    if (streak) components.push(`${signedElo(elo(streak))} за серию ошибок`);
    if (relief) components.push(`${signedElo(elo(relief))} смягчение по завещаниям`);
    const maths = components.length > 1 || item.critical
      ? `(${components.join(', ')})${item.critical ? ' ×2 за критический круг' : ''} = ${signedElo(elo(total))}`
      : signedElo(elo(total));
    return `${context}${action}: ${maths}`;
  });
};

/**
 * The breakdown of a seat's contribution in short plain words and Elo (owner, 2026-10-25: «попроще и попонятнее»), one
 * line per kind of action, e.g. «Голосовал в чёрных №10, №1: +4»; caps are shown separately by the game blank.
 */
export function contributionBreakdown(role: StatRole | null, items: ContributionItem[], streaks: StreakRun[] = []): string[] {
  const of = (kind: ContributionKind) => items.filter((item) => item.kind === kind);
  const lines = blackRole(role)
    ? [of('black_checked_first_night').length ? `Шериф проверил чёрным в первую ночь: ${signedElo(elo(of('black_checked_first_night')[0].points))}` : null, of('out_at_nine').length ? `Ушёл на девятке: ${signedElo(elo(of('out_at_nine')[0].points))}` : null, group('Проверкой в первую ночь нашёл шерифа', of('don_found_sheriff')), group('Записан красным у', of('named_red')), group('Записан чёрным у', of('named_black')), group('Не записан у', of('not_named'))]
    : [
      group('Попил, ушёл чёрный', of('split_outcome').filter((item) => item.points > 0)),
      group('Попил, ушёл красный', of('split_outcome').filter((item) => item.points < 0)),
      group('Голосовал в чёрных', of('found_black').filter((item) => !item.stayed)),
      group('Голосовал в чёрных, которых не вывели (половина)', of('found_black').filter((item) => item.stayed)),
      of('obvious_black').length ? `Голосовал в уже известных чёрных ${seatNumbers(of('obvious_black'))} — без баллов` : null,
      ...mistakeLines(items, 'vote_red'),
      group('В завещании угадал', of('will_right')),
      of('will_already').length ? `В завещании снова назвал ${seatNumbers(of('will_already'))} — уже засчитан` : null,
      ...mistakeLines(items, 'will_wrong'),
      group('Чёрная проверка', of('check_black')),
      group('Стол вывел проверенного чёрного', of('check_voted_out')),
    ];
  for (const item of of('zero_break')) lines.unshift(`Сломал попил в нуле в №${item.seat}: ${signedElo(elo(item.points))}`);
  for (const item of of('zero_broken_into')) lines.unshift(`В нуле в него сломал попил №${item.seat}: ${signedElo(elo(item.points))}`);
  if (of('will_blocked').length) lines.push('Завещание с ошибкой: за верные цвета плюсов нет');
  // The series in plain words: which decisions came in a row and what the run added (owner, 2026-10-26).
  // A red-vote/will streak is already included beside that action above. Never charge it a
  // second time in the explanation. Keep legacy runs only if itemized series data is absent.
  const itemizedStreaks = of('streak_correct').length + of('streak_wrong').length;
  if (!itemizedStreaks) for (const run of streaks) {
    lines.push(`${run.sign > 0 ? 'Верно подряд' : 'Ошибки подряд'}: ${run.labels.join(' → ')}: ${signedElo(elo(run.points))}`);
  }
  for (const item of [...of('streak_correct'), ...of('streak_wrong')].filter((entry) => entry.source !== 'vote_red' && entry.source !== 'will_wrong')) {
    lines.push(`Серия ${item.points > 0 ? 'верных решений' : 'ошибок'} · №${item.seat}: ${signedElo(elo(item.points))}`);
  }
  const pool = of('pool_cap');
  if (pool.length) lines.push(`Больше +${elo(CONTRIBUTION_WEIGHTS.positivePool)} за игру не набрать: ${signedElo(elo(pool[0].points))}`);
  const unvoted = of('unvoted_round');
  if (unvoted.length) lines.push(`Кругов, где за него никто не голосовал: ${unvoted.length}, ${signedElo(elo(unvoted.reduce((sum, item) => sum + item.points, 0)))}`);
  for (const item of of('split_break_red')) lines.push(`Сломал попил красным: ${signedElo(elo(item.points))}`);
  for (const item of of('elo_tag_false_sheriff_red_sheriff')) lines.push(`${ELO_TAGS.false_sheriff_red_sheriff.label}: ${signedElo(elo(item.points))}`);
  for (const item of of('elo_tag_revealed_to_black')) lines.push(`${ELO_TAGS.revealed_to_black.label}: ${signedElo(elo(item.points))}`);
  for (const item of of('elo_tag_killed_sheriff_zero')) lines.push(`${ELO_TAGS.killed_sheriff_zero.label}: ${signedElo(elo(item.points))}`);
  for (const item of of('raise_defeat_black')) lines.push(`Красные подняли руки за подъём, после которого проиграли: ${signedElo(elo(item.points))}`);
  for (const item of of('raise_defeat')) lines.push(`Поднял руку за последний подъём, после которого красные проиграли: ${signedElo(elo(item.points))}`);
  const misses = of('shot_miss');
  if (misses.length) lines.push(`Отдельный штраф за промах: ночи ${misses.map((item) => item.night).join(', ')}: ${signedElo(elo(misses.reduce((sum, item) => sum + item.points, 0)))}`);
  return lines.filter((line): line is string => Boolean(line));
}



