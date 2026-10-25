import { describe, expect, it } from 'vitest';
import { gameContribution } from '../lib/playerContribution.ts';
import { gameActionFacts } from '../lib/gameActionFacts';
import type { LiveGameEvent } from '../shared/liveGameEvents';

const roles = ['sheriff', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'mafia', 'mafia', 'don'];
const results = roles.map((role, index) => ({ seat_number: index + 1, role, player_id: `p${index + 1}`, color_protocol: [] }));
const event = (kind: string, extra: Partial<LiveGameEvent> = {}) => ({ seq: 0, at: 'x', round: 2, phase: 'day_voting', kind, ...extra });
const contribution = (events: LiveGameEvent[], seat: number) => gameContribution({
  protocol: { winner_team: 'red', events }, player_results: results,
}).find((row) => row.seat === seat)!.points;

describe('corrected voting results use the final marker for Elo', () => {
  it('does not score a cancelled single elimination that became a tied voting', () => {
    const events = [
      event('vote', { seat: 1, target: 8, value: 1 }),
      event('vote', { seat: 3, target: 2, value: 1 }),
      event('vote_round_result', { value: '1:single_eliminated' }),
      event('exit', { seat: 2, value: 'voted_day' }),
      event('restored', { seat: 2 }),
      event('vote_round_result', { value: '1:tie_revote' }),
      event('vote', { seat: 1, target: 2, value: 2 }),
      event('vote', { seat: 3, target: 8, value: 2 }),
      event('vote_round_result', { value: '2:single_eliminated' }),
      event('exit', { seat: 2, value: 'voted_day' }),
    ].map((row, index) => ({ ...row, seq: index + 1 }));
    expect(contribution(events, 1)).toBeCloseTo(-0.1, 10);
    expect(contribution(events, 3)).toBeCloseTo(0.2, 10);
  });

  it('scores a confirmed single elimination even when its first marker said tie', () => {
    const events = [
      event('vote', { seat: 1, target: 8, value: 1 }),
      event('vote', { seat: 3, target: 2, value: 1 }),
      event('vote_round_result', { value: '1:tie_revote' }),
      event('vote_round_result', { value: '1:single_eliminated' }),
      event('exit', { seat: 2, value: 'voted_day' }),
    ].map((row, index) => ({ ...row, seq: index + 1 }));
    expect(contribution(events, 1)).toBeCloseTo(0.2, 10);
    expect(contribution(events, 3)).toBeCloseTo(-0.1, 10);
    const facts = gameActionFacts({ id: 'correction', source: 'club', date: '', winner: 'red', events,
      seats: results.map((row) => ({ seat: row.seat_number, playerId: row.player_id, role: row.role as any })) });
    expect(facts.votings.map((voting) => voting.outcome)).toEqual(['single_eliminated']);
  });
});
