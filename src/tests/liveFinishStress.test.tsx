// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mapEngineResultToProtocol } from '../components/crm/EveningLiveGameModal.tsx';
import { computeIssues, winnerTableMessage } from '../components/crm/gameProtocol/protocolReview.ts';
import { deriveExitTypes } from '../components/crm/tournaments/protocol/protocolStateUtils.ts';
import { determineLiveWinner } from '../lib/liveGameFlow.ts';
import { buildFinalChronology } from '../lib/liveGameEventLog.ts';
import { canonicalizeClubGameSave } from '../server/services/clubGameProtocolService.ts';
import { GAME_ROLES } from '../shared/gameRoles.ts';
import { cleanAndSyncVotes, createNextRevoteRound, determineVotingResult } from '../shared/tournamentVoting.ts';
import { renumberVotingRoundsSequentially } from '../lib/liveClubSession.ts';

/**
 * Stress test of the end of a live game (owner, 2026-11-01: data of the live game did not reach the app): random but rule-abiding
 * games are played out, handed over exactly like `onGameFinished` does, mapped into the club protocol and pushed through the
 * server's completion gate. A game the live engine ends by the rules must always be saved, and the saved record must agree with
 * the table (winner, exits, nights, votes).
 */
const ROLES = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'] as const;
const rng = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const pick = <T,>(r: () => number, list: T[]): T => list[Math.floor(r() * list.length)];

const makeGame = (): any => ({
  id: 7, global_game_number: 7, table_name: 'Стол 1', judge_name: 'Судья',
  club_protocol: {
    version: 1, kind: 'club_evening_protocol',
    protocol: { game_id: '7', status: 'draft', winner_team: null, votes: [], shots: [], best_moves: [], best_move_seats: [], events: [] },
    player_results: ROLES.map((_, i) => ({
      participant_id: `p${i + 1}`, player_id: `u${i + 1}`, seat_number: i + 1, display_name: `Игрок ${i + 1}`, role: null,
      exit_type: 'alive', regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0, color_protocol: [],
    })),
  },
});

type Played = { payload: any; expectedWinner: 'Красные' | 'Чёрные'; exits: Map<number, string> };

const play = (seed: number): Played => {
  const r = rng(seed);
  const roles = [...ROLES].sort(() => r() - 0.5);
  const alive = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const exits = new Map<number, string>();
  const votes: any[] = [];
  const shots: any[] = [];
  const players = () => [...alive].map((seat) => ({ slot_num: seat, role: roles[seat - 1], alive: true }));
  const winner = () => determineLiveWinner(players() as any);
  let result: ReturnType<typeof winner> = null;
  const discipline = new Map<number, { fouls: number; minor: number; major: number; reason: string | null }>();
  let ppkSeat: number | null = null;
  let firstKilled: number | null = null;
  let zeroVoted: number | null = null;

  // A removal cancels the next voting (the live game's rule): that day goes straight to the night.
  const maybeRemove = (): boolean => {
    if (r() > 0.25 || alive.size < 4) return false;
    const seat = pick(r, [...alive]);
    const byTech = r() < 0.4;
    discipline.set(seat, byTech ? { fouls: 0, minor: 1, major: 1, reason: '2nd_tech' } : { fouls: 4, minor: 0, major: 0, reason: '4th_foul' });
    alive.delete(seat); exits.set(seat, 'removed');
    return true;
  };
  for (let day = 0; day < 12 && !result; day += 1) {
    const votingCancelled = maybeRemove();
    result = winner();
    if (result) break;
    if (r() < 0.05 && day > 0) {
      // PPK: the game ends at once, the other team wins.
      ppkSeat = pick(r, [...alive]);
      result = ['mafia', 'don'].includes(roles[ppkSeat - 1]) ? 'Красные' : 'Чёрные';
      break;
    }
    if (!votingCancelled) {
    // Day: nominate, vote, maybe revote.
      const seats = [...alive];
      const nominated = [...seats].sort(() => r() - 0.5).slice(0, Math.min(seats.length, 1 + Math.floor(r() * 4)));
      const eligible = seats.length;
      let round: any = { round_number: votes.length + 1, is_revote: false, nominated_seats: nominated, vote_counts: {}, day_number: day, eligible_voters: eligible, outcome: 'pending', eliminated_seats: [] };
      const split = (target: any) => {
        const counts: Record<number, number> = Object.fromEntries(target.nominated_seats.map((s: number) => [s, 0]));
        for (let v = 0; v < target.eligible_voters; v += 1) counts[pick(r, target.nominated_seats as number[]) as number] += 1;
        return counts;
      };
      round.vote_counts = split(round);
      let resolved = determineVotingResult(round);
      let outcome = (resolved as any).resolvedOutcome || resolved.outcome;
      for (let chain = 0; outcome === 'tie_revote' && chain < 6; chain += 1) {
        votes.push({ ...round, outcome: 'tie_revote', eliminated_seats: [] });
        round = { ...createNextRevoteRound({ ...round, outcome: 'tie_revote' } as any, resolved.winners), round_number: votes.length + 1 };
        round.vote_counts = r() < 0.4 ? Object.fromEntries(round.nominated_seats.map((s: number) => [s, 0]).map(([s]: any[], k: number, all: any[]) => [s, k < all.length - 1 ? Math.floor(round.eligible_voters / all.length) : round.eligible_voters - Math.floor(round.eligible_voters / all.length) * (all.length - 1)])) : split(round);
        resolved = determineVotingResult(round);
        outcome = (resolved as any).resolvedOutcome || resolved.outcome;
        if (resolved.outcome === 'requires_table_decision' && !(resolved as any).resolvedOutcome) {
          round.table_leave_votes = Math.floor(r() * (round.eligible_voters + 1));
          resolved = determineVotingResult(round);
          outcome = (resolved as any).resolvedOutcome || resolved.outcome;
        }
      }
      const eliminated = outcome === 'single_eliminated' ? [resolved.winners[0]] : outcome === 'all_tied_eliminated' ? resolved.winners : [];
      votes.push({ ...round, outcome: outcome === 'tie_revote' ? 'no_elimination' : outcome, eliminated_seats: outcome === 'tie_revote' ? [] : eliminated });
      for (const seat of outcome === 'tie_revote' ? [] : eliminated) { alive.delete(seat); exits.set(seat, day === 0 ? 'voted_zero_round' : 'voted_day'); }
      if (day === 0 && eliminated.length === 1) zeroVoted = eliminated[0];
      result = winner();
      if (result) break;
    }
    // Night: the mafia shoots (or misses).
    const target = pick(r, [...alive]);
    const killed = r() < 0.8;
    shots.push({ night_number: shots.length + 1, target_seat: killed ? target : 0, result: killed ? 'killed' : 'miss' });
    if (killed) { alive.delete(target); exits.set(target, 'killed'); if (firstKilled === null && shots.length === 1) firstKilled = target; }
    result = winner();
  }
  if (!result) throw new Error('the simulated game did not finish');
  const slots = roles.map((role, i) => ({
    slot_num: i + 1, user_id: `u${i + 1}`, nickname: `Игрок ${i + 1}`, role: GAME_ROLES[role].label, alive: alive.has(i + 1),
    exit_reason: exits.get(i + 1) || 'alive', fouls: discipline.get(i + 1)?.fouls ?? 0, minor_tech_fouls: discipline.get(i + 1)?.minor ?? 0, major_tech_fouls: discipline.get(i + 1)?.major ?? 0,
    removal_reason: discipline.get(i + 1)?.reason ?? null, kick: discipline.get(i + 1)?.reason === '4th_foul', ppk: ppkSeat === i + 1,
  }));
  return {
    expectedWinner: result, exits,
    payload: {
      winning_team: result, slots, votes, shots, events: [], protocol_text: '', judge_id: 'j', zero_round_rule: 'tournament', end_reason: ppkSeat ? 'ppk' : 'normal',
      protocol_markers: { firstKilledSlot: firstKilled, zeroRoundVotedSlot: zeroVoted },
    },
  };
};

describe('end of a live game → club protocol: random rule-abiding games', () => {
  it.each(Array.from({ length: 300 }, (_, i) => 9000 + i))('seed %i is saved and agrees with the table', (seed) => {
    const played = play(seed);
    const game = makeGame();
    const events = buildFinalChronology({ events: [], lastSnapshot: null, gameData: played.payload, deathProtocols: {}, at: '2026-11-01T00:00:00.000Z' });
    const mapped = mapEngineResultToProtocol(game, { ...played.payload, events, votes: renumberVotingRoundsSequentially(cleanAndSyncVotes(played.payload.votes, 10) as any) });
    // The winner and the exits are exactly what the table says.
    expect(mapped.protocol.winner_team).toBe(played.expectedWinner === 'Красные' ? 'red' : 'black');
    for (const player of mapped.player_results) expect(player.exit_type, `seat ${player.seat_number}`).toBe(played.exits.get(player.seat_number) || 'alive');
    if (mapped.protocol.end_reason === 'ppk') expect(mapped.protocol.ppk_culprit_participant_id).toBeTruthy();
    expect(winnerTableMessage(mapped.protocol, mapped.player_results)).toBeNull();
    // The evidence explains every exit.
    const derived = deriveExitTypes(mapped.protocol.votes || [], mapped.protocol.shots || [], mapped.protocol.first_killed_participant_id ?? null, mapped.player_results);
    for (const player of mapped.player_results) expect(derived.get(player.seat_number), `evidence for seat ${player.seat_number}`).toBe(player.exit_type);
    // The protocol review finds nothing wrong with a game played by the rules.
    const errors = computeIssues({ protocol: mapped.protocol, results: mapped.player_results } as any).filter((issue) => issue.severity === 'error');
    expect(errors.map((issue) => `${issue.id}: ${issue.title}`)).toEqual([]);
    const voterChecks = computeIssues({ protocol: mapped.protocol, results: mapped.player_results } as any).filter((issue) => issue.id.startsWith('voters-'));
    expect(voterChecks.map((issue) => issue.title)).toEqual([]);
    // The server accepts the completion.
    expect(() => canonicalizeClubGameSave(game.club_protocol, mapped.protocol, mapped.player_results, 'completed')).not.toThrow();
  });
});

describe('end of a live game: no invented winner', () => {
  it('an unreadable winner stops the save instead of writing «чёрные»', () => {
    const played = play(9001);
    expect(() => mapEngineResultToProtocol(makeGame(), { ...played.payload, winning_team: undefined })).toThrow(/победившую команду/);
    expect(() => mapEngineResultToProtocol(makeGame(), { ...played.payload, winning_team: 'ничья' })).toThrow(/победившую команду/);
  });
});
