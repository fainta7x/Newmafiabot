import type { StatGame, StatRole } from './gameStatistics';
import { buildGameAnalysis } from './liveGameAnalysis';

export const redRole = (role: StatRole | null | undefined) => role === 'citizen' || role === 'sheriff';
export const blackRole = (role: StatRole | null | undefined) => role === 'mafia' || role === 'don';
export type TargetCounts = { red: number; black: number; sheriff: number; unknown: number };
export const emptyTargets = (): TargetCounts => ({ red: 0, black: 0, sheriff: 0, unknown: 0 });
export const countTarget = (counts: TargetCounts, role: StatRole | null | undefined) => {
  if (redRole(role)) counts.red += 1;
  else if (blackRole(role)) counts.black += 1;
  else counts.unknown += 1;
  if (role === 'sheriff') counts.sheriff += 1; // subset of red, never added twice to the total
};
export const isCriticalCircle = (red: number, black: number) => black > 0 && red > black && red - black <= 2;

export interface ActionVoting {
  seq?: number;
  round: number; votes: Map<number, number>; nominations: Array<{ seat: number; by: number | null }>;
  eliminated: number | null; alive: Set<number> | null; critical: boolean | null;
  /** This voting phase's own result («single_eliminated», «tie_revote», «no_elimination», …), null without a result marker. */
  outcome: string | null;
  /** The voting's number within its day (1, 2 for a revote, …), as in the protocol's votes of that day. */
  number?: number;
}
export interface ActionCheck { kind: 'sheriff' | 'don'; target: number; seq: number; alive: Set<number> | null }

type GameActionFacts = ReturnType<typeof computeGameActionFacts>;
/** An explicit cache a caller may hold for games it knows are never mutated (a ranking asks for the same game once per player). */
export type ActionFactsMemo = Map<StatGame, GameActionFacts>;
export function gameActionFacts(game: StatGame, memo?: ActionFactsMemo): GameActionFacts {
  const cached = memo?.get(game);
  if (cached) return cached;
  const facts = computeGameActionFacts(game);
  memo?.set(game, facts);
  return facts;
}

/** Count confirmed vote phases in days where exactly one player was voted out; exclude zero round and multi-exits. */
function computeGameActionFacts(game: StatGame) {
  const events = [...game.events].sort((a, b) => a.seq - b.seq);
  const uniqueSeats = new Set(game.seats.map(s => s.seat));
  let full = events[0]?.kind === 'game_start' && ['setup', 'zero_night'].includes(events[0].phase)
    && events.some(e => e.kind === 'game_end' && e.value === game.winner) && game.seats.every(s => s.role && Number.isInteger(s.seat) && s.seat > 0)
    && uniqueSeats.size === game.seats.length;
  const roleOf = (seat: number) => game.seats.find(s => s.seat === seat)?.role;
  const alive = new Set(uniqueSeats);
  const atSeq = new Map<number, Set<number>>();
  for (const event of events) {
    atSeq.set(event.seq, new Set(alive));
    if (event.kind === 'exit' && event.seat) {
      if (!alive.has(event.seat)) full = false;
      alive.delete(event.seat);
    }
    if (event.kind === 'restored' && event.seat) {
      // A recorded undo of a known exit preserves chronology; an unexplained restoration does not.
      if (!uniqueSeats.has(event.seat) || alive.has(event.seat)) full = false;
      alive.add(event.seat);
    }
  }
  const circles = buildGameAnalysis(events).circles;
  const votings: ActionVoting[] = [];
  let excluded = 0;
  for (const circle of circles) {
    if (!circle.votings.length) continue;
    // The whole day's voting is eligible if the day resulted in exactly one voted-out player.
    // Never require the voter to have voted for that eliminated player: accuracy is about the target's role.
    const exits = circle.exits.filter(e => e.reason === 'voted_day');
    const multipleExited = exits.length > 1 || circle.votings.some(v => v.outcome === 'all_tied_eliminated');
    if (circle.round <= 1 || multipleExited || exits.length !== 1) { excluded += 1; continue; }
    const eliminated = exits[0].seat;
    for (const voting of circle.votings) {
      // Count each completed voting phase's actual ballots, including ballots before a revote.
      // Count recorded role-targeting ballots regardless of the presence of a round-result marker.
      // The sole voted-day exit, not a special result value, establishes the day's eligibility.
      // Table raise/leave choices aren't role-targeting ballots.
      if (!voting.votes.length) continue;
      const votes = new Map<number, number>();
      for (const ballot of voting.votes) for (const voter of ballot.voters) votes.set(voter, ballot.candidate);
      // The judge can correct a completed voting. Match buildGameAnalysis: its latest result wins.
      // An earlier single elimination may have been restored and replaced by a tied voting.
      const result = [...events].reverse().find(e => e.round === circle.round && e.kind === 'vote_round_result'
        && String(e.value).startsWith(`${voting.number}:`));
      const state = full && result ? atSeq.get(result.seq) || null : null;
      const reds = state ? [...state].filter(s => redRole(roleOf(s))).length : 0;
      const blacks = state ? [...state].filter(s => blackRole(roleOf(s))).length : 0;
      votings.push({ seq: result?.seq, round: circle.round, votes, nominations: circle.nominations, eliminated, alive: state,
        critical: state ? isCriticalCircle(reds, blacks) : null, outcome: result ? String(result.value).split(':')[1] || null : null, number: voting.number });
    }
  }
  // A selection is confirmed only after leaving the corresponding night substep. Re-selections replace it.
  const checks: ActionCheck[] = [];
  for (const kind of ['sheriff', 'don'] as const) {
    const rounds = new Set(events.filter(e => e.kind === `${kind}_check` && e.phase === 'night').map(e => e.round));
    for (const round of rounds) {
      const candidates = events.filter(e => e.round === round && e.phase === 'night' && e.kind === `${kind}_check`);
      const selected = candidates.at(-1);
      if (!selected?.target) continue;
      const confirmed = events.find(e => e.seq > selected.seq && e.round === round && e.phase === 'night'
        && e.kind === 'night_step' && (kind === 'don' ? ['sheriff','best_move','morning'].includes(String(e.value)) : ['best_move','morning'].includes(String(e.value))));
      if (!confirmed) continue;
      const state = full ? atSeq.get(selected.seq) || null : null;
      const checker = game.seats.find(s => s.role === kind)?.seat;
      if (state && (!checker || !state.has(checker) || !state.has(selected.target))) continue;
      checks.push({ kind, target: selected.target, seq: selected.seq, alive: state });
    }
  }
  const ordinary = !events.some(e => e.kind === 'ppk' || (e.kind === 'exit' && ['removed','ppk'].includes(String(e.value))));
  return { full, circles, votings, checks, excluded, ordinary, alive: full ? alive : null, events, roleOf, atSeq };
}

export interface PlayerActionMetrics {
  votes: { red: TargetCounts; black: TargetCounts };
  criticalVotes: { red: TargetCounts; black: TargetCounts };
  checks: { sheriff: TargetCounts; don: TargetCounts };
  excludedVotingDays: number; unknownCriticalDays: number;
}
export const emptyActionMetrics = (): PlayerActionMetrics => ({ votes: { red: emptyTargets(), black: emptyTargets() },
  criticalVotes: { red: emptyTargets(), black: emptyTargets() }, checks: { sheriff: emptyTargets(), don: emptyTargets() }, excludedVotingDays: 0, unknownCriticalDays: 0 });
export function playerActionMetrics(games: StatGame[], playerId: string, memo?: ActionFactsMemo): PlayerActionMetrics {
  const metrics = emptyActionMetrics();
  const seen = new Set<string>();
  for (const game of games) {
    if (seen.has(game.id)) continue;
    seen.add(game.id);
    const mine = game.seats.find(s => s.playerId === playerId);
    if (!mine?.role) continue;
    const facts = gameActionFacts(game, memo);
    const team = redRole(mine.role) ? 'red' : 'black';
    metrics.excludedVotingDays += facts.excluded;
    for (const voting of facts.votings) {
      const target = voting.votes.get(mine.seat);
      if (!target) continue;
      countTarget(metrics.votes[team], facts.roleOf(target));
      if (voting.critical === true) countTarget(metrics.criticalVotes[team], facts.roleOf(target));
      if (voting.critical === null) metrics.unknownCriticalDays += 1;
    }
    for (const check of facts.checks) if (check.kind === mine.role) countTarget(metrics.checks[check.kind], facts.roleOf(check.target));
  }
  return metrics;
}

