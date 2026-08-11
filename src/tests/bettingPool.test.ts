import { describe, expect, it } from 'vitest';
import {
  BettingIneligibleError,
  assertBettingEligibility,
  calculatePoolCoefficient,
  calculatePoolPayout,
  type BettingPoolRow,
} from '../server/services/bettingPoolService.ts';

const makePool = (overrides: Partial<BettingPoolRow> = {}): BettingPoolRow => ({
  id: 'pool_test',
  game_id: 1,
  game_number: 1,
  game_date: '2026-08-11',
  judge_player_id: 'judge',
  status: 'open',
  opens_at: '2026-08-11T10:00:00.000Z',
  closes_at: '2026-08-11T10:01:30.000Z',
  role_snapshot_json: JSON.stringify([
    { seat_number: 1, participant_id: 'ep1', player_id: 'p1', nickname: 'P1', role: 'citizen', team: 'red' },
    { seat_number: 2, participant_id: 'ep2', player_id: 'p2', nickname: 'P2', role: 'mafia', team: 'black' },
  ]),
  house_rate_bps: 1000,
  max_coefficient: 10,
  red_pool: 0,
  black_pool: 0,
  settlement_seq: 0,
  settled_winner: null,
  reserve_amount: 0,
  settled_at: null,
  notified_at: null,
  notification_count: 0,
  created_at: '2026-08-11T10:00:00.000Z',
  updated_at: '2026-08-11T10:00:00.000Z',
  ...overrides,
});

describe('betting totalizator coefficients', () => {
  it('gives no profit when the winning side has no opposing pool', () => {
    expect(calculatePoolCoefficient(5000, 0, 1000, 10)).toBe(1);
    expect(calculatePoolPayout(500, 5000, 0, 1000, 10)).toEqual({ coefficient: 1, payout: 500 });
  });

  it('makes the overloaded favourite unattractive and the underdog attractive', () => {
    expect(calculatePoolCoefficient(3000, 500, 1000, 10)).toBe(1.15);
    expect(calculatePoolCoefficient(500, 3000, 1000, 10)).toBe(6.4);
  });

  it('caps an extreme underdog at x10', () => {
    expect(calculatePoolCoefficient(50, 10_000, 1000, 10)).toBe(10);
  });

  it('never pays out more tokens than the total pool', () => {
    const winnerPool = 3000;
    const loserPool = 500;
    const first = calculatePoolPayout(1000, winnerPool, loserPool, 1000, 10).payout;
    const second = calculatePoolPayout(2000, winnerPool, loserPool, 1000, 10).payout;
    expect(first + second).toBe(3450);
    expect(winnerPool + loserPool - first - second).toBe(50);
  });
});

describe('betting eligibility', () => {
  it('blocks a player seated in the game', () => {
    expect(() => assertBettingEligibility(makePool(), 'p1')).toThrow(BettingIneligibleError);
  });

  it('blocks the linked judge', () => {
    expect(() => assertBettingEligibility(makePool(), 'judge')).toThrow(BettingIneligibleError);
  });

  it('allows a spectator', () => {
    expect(() => assertBettingEligibility(makePool(), 'spectator')).not.toThrow();
  });
});
