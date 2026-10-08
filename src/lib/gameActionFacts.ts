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
  round: number; votes: Map<number, number>; nominations: Array<{ seat: number; by: number | null }>;
  eliminated: number | null; alive: Set<number> | null; critical: boolean | null;
}
export interface ActionCheck { kind: 'sheriff' | 'don'; target: number; seq: number; alive: Set<number> | null }

/** Conservative evidence: final ballots once per day; zero day and every raise/leave chain are excluded. */
export function gameActionFacts(game: StatGame) {
  const events = [...game.events].sort((a, b) => a.seq - b.seq);
  const uniqueSeats = new Set(game.seats.map(s => s.seat));
  const full = events[0]?.kind === 'game_start' && ['setup', 'zero_night'].includes(events[0].phase)
    && events.some(e => e.kind === 'game_end' && e.value === game.winner) && !events.some(e => e.kind === 'restored') && game.seats.every(s => s.role && Number.isInteger(s.seat) && s.seat > 0)
    && uniqueSeats.size === game.seats.length;
  const roleOf = (seat: number) => game.seats.find(s => s.seat === seat)?.role;
  const alive = new Set(uniqueSeats);
  const atSeq = new Map<number, Set<number>>();
  for (const event of events) {
    atSeq.set(event.seq, new Set(alive));
    if (event.kind === 'exit' && event.seat) alive.delete(event.seat);
    if (event.kind === 'restored' && event.seat) alive.add(event.seat);
  }
  const circles = buildGameAnalysis(events).circles;
  const votings: ActionVoting[] = [];
  let excluded = 0;
  for (const circle of circles) {
    if (!circle.votings.length) continue;
    const chain = events.filter(e => e.round === circle.round && (e.phase === 'day_voting' || e.kind === 'vote_round_result'));
    const tableDecision = chain.some(e => e.kind === 'table_vote' || (e.kind === 'voting_stage' && e.value === 'table_decision'))
      || circle.votings.some(v => v.outcome === 'all_tied_eliminated' || v.tableVoters.length)
      || game.votingRounds?.some(v => Number(v.day_number) === circle.round - 1 && v.table_leave_votes != null);
    const last = circle.votings.at(-1)!;
    if (circle.round <= 1 || tableDecision || last.outcome !== 'single_eliminated') { excluded += 1; continue; }
    const result = chain.filter(e => e.kind === 'vote_round_result' && String(e.value).endsWith(':single_eliminated')).at(-1);
    if (!result) continue;
    const state = full ? atSeq.get(result.seq) || null : null;
    const reds = state ? [...state].filter(s => redRole(roleOf(s))).length : 0;
    const blacks = state ? [...state].filter(s => blackRole(roleOf(s))).length : 0;
    const votes = new Map<number, number>();
    for (const ballot of last.votes) for (const voter of ballot.voters) votes.set(voter, ballot.candidate);
    const exits = circle.exits.filter(e => e.reason === 'voted_day');
    const eliminated = exits.length === 1 ? exits[0].seat : null;
    votings.push({ round: circle.round, votes, nominations: circle.nominations, eliminated, alive: state,
      critical: state ? isCriticalCircle(reds, blacks) : null });
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
export function playerActionMetrics(games: StatGame[], playerId: string): PlayerActionMetrics {
  const metrics = emptyActionMetrics();
  const seen = new Set<string>();
  for (const game of games) {
    if (seen.has(game.id)) continue;
    seen.add(game.id);
    const mine = game.seats.find(s => s.playerId === playerId);
    if (!mine?.role) continue;
    const facts = gameActionFacts(game);
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
