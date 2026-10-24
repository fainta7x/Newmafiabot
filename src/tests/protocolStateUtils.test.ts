import { describe, expect, it } from 'vitest';
import {
  calculateGuessedBlacks,
  getOppositeTeam,
  syncAllEventsToResults
} from '../components/crm/tournaments/protocol/protocolStateUtils';

const createPlayer = (
  seatNumber: number,
  role: string | null,
  overrides: Record<string, unknown> = {}
) => ({
  participant_id: `p-${seatNumber}`,
  seat_number: seatNumber,
  display_name: `Player ${seatNumber}`,
  role,
  exit_type: 'alive',
  exit_order: null,
  removal_reason: null,
  regular_fouls: 0,
  minor_technical_fouls: 0,
  major_technical_fouls: 0,
  technical_fouls: 0,
  judge_bonus: 0,
  protocol_bonus: 0,
  penalty_points: 0,
  color_protocol: [],
  notes: null,
  ...overrides
});

describe('protocol state utilities', () => {
  it('determines the opposite team for PPK', () => {
    expect(getOppositeTeam('citizen')).toBe('black');
    expect(getOppositeTeam('шериф')).toBe('black');
    expect(getOppositeTeam('mafia')).toBe('red');
    expect(getOppositeTeam('дон')).toBe('red');
    expect(getOppositeTeam(null)).toBeNull();
    expect(getOppositeTeam('unknown')).toBeNull();
  });

  it('calculates guessed black players and best-move bonus', () => {
    const results = [
      createPlayer(1, 'mafia'),
      createPlayer(2, 'don'),
      createPlayer(3, 'citizen')
    ] as any;

    expect(calculateGuessedBlacks([1, 2, 3], results)).toEqual({
      guessedBlacks: 2,
      bonusPoints: 0.3
    });
  });

  it('synchronizes event statuses and zero-round best move owner', () => {
    const results = [
      createPlayer(1, 'citizen', {
        regular_fouls: 4,
        exit_type: 'removed',
        removal_reason: '4th_foul'
      }),
      createPlayer(2, 'citizen'),
      createPlayer(3, 'mafia'),
      createPlayer(4, 'citizen')
    ] as any;

    const protocol = {
      best_moves: [
        {
          participant_id: 'old-player',
          source: 'zero_round_voted',
          seat_numbers: [1, 3]
        }
      ],
      zero_round_voted_participant_id: null
    } as any;

    const synced = syncAllEventsToResults(
      [
        {
          day_number: 0,
          outcome: 'eliminated',
          eliminated_seats: [2]
        }
      ],
      [{ night_number: 1, target_seat: 3, result: 'killed' }],
      'p-4',
      results,
      protocol
    );

    expect(synced.player_results.map((player) => player.exit_type)).toEqual([
      'removed',
      'voted_zero_round',
      'killed',
      'killed'
    ]);
    expect(synced.protocol.zero_round_voted_participant_id).toBe('p-2');
    expect(synced.protocol.best_moves[0].participant_id).toBe('p-2');
  });

  describe('an edit changes only what the edit changed', () => {
    const baseline = { votes: [] as any[], shots: [] as any[], firstKilledId: null as string | null };

    it('keeps an exit the evidence cannot explain (a game whose last voting was never recorded)', () => {
      // Player 3 was voted out on a day the saved rounds do not contain; the judge then fixes an unrelated night.
      const results = [
        createPlayer(1, 'citizen'),
        createPlayer(2, 'mafia'),
        createPlayer(3, 'citizen', { exit_type: 'voted_day', notes: 'Голосование (День 3)' }),
        createPlayer(4, 'citizen')
      ] as any;
      const shots = [{ night_number: 1, target_seat: 4, result: 'killed' }];
      const synced = syncAllEventsToResults([], shots, 'p-4', results, {} as any, { ...baseline, shots: [{ night_number: 1, target_seat: 4, result: 'miss' }] });
      expect(synced.player_results.map((player) => player.exit_type)).toEqual(['alive', 'alive', 'voted_day', 'killed']);
    });

    it('still removes an exit that the edit itself took away', () => {
      const results = [
        createPlayer(1, 'citizen'),
        createPlayer(2, 'citizen', { exit_type: 'voted_day' })
      ] as any;
      const round = { day_number: 1, outcome: 'single_eliminated', eliminated_seats: [2] };
      const synced = syncAllEventsToResults([], [], null, results, {} as any, { votes: [round], shots: [], firstKilledId: null });
      expect(synced.player_results.map((player) => player.exit_type)).toEqual(['alive', 'alive']);
    });

    it('applies an exit the edit added, and leaves the others alone', () => {
      const results = [
        createPlayer(1, 'citizen', { exit_type: 'voted_zero_round' }),
        createPlayer(2, 'citizen'),
        createPlayer(3, 'citizen')
      ] as any;
      const round = { day_number: 1, outcome: 'single_eliminated', eliminated_seats: [3] };
      const synced = syncAllEventsToResults([round], [], null, results, {} as any, baseline);
      expect(synced.player_results.map((player) => player.exit_type)).toEqual(['voted_zero_round', 'alive', 'voted_day']);
    });
  });
});
