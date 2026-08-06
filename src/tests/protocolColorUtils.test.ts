import { describe, expect, it } from 'vitest';
import type { PlayerResultData } from '../lib/api';
import {
  addColorMarkToResults,
  createColorMarkEditState,
  deleteColorMarkFromResults,
  moveColorMarkInResults,
  saveEditedColorMarkToResults,
  setColorMarkEditType,
  toggleColorMarkEditSeat,
  toggleColorSeatInList
} from '../components/crm/tournaments/protocol/protocolColorUtils';

const createPlayer = (
  participantId: string,
  overrides: Partial<PlayerResultData> = {}
): PlayerResultData => ({
  participant_id: participantId,
  player_id: `player-${participantId}`,
  seat_number: 1,
  display_name: participantId,
  role: 'citizen',
  exit_type: 'alive',
  exit_order: null,
  regular_fouls: 0,
  minor_technical_fouls: 0,
  major_technical_fouls: 0,
  technical_fouls: 0,
  judge_bonus: 0,
  protocol_bonus: 0,
  penalty_points: 0,
  color_protocol: [],
  notes: null,
  removal_reason: null,
  ...overrides
});

describe('protocol color utilities', () => {
  it('toggles seats and keeps them sorted', () => {
    expect(toggleColorSeatInList([5, 2], 3)).toEqual([2, 3, 5]);
    expect(toggleColorSeatInList([2, 3, 5], 3)).toEqual([2, 5]);
  });

  it('adds a sorted color mark only to the selected player', () => {
    const first = createPlayer('p-1');
    const second = createPlayer('p-2');
    const updated = addColorMarkToResults(
      [first, second],
      'p-1',
      [7, 2, 5],
      'black'
    );

    expect(updated[0].color_protocol).toEqual([
      { seat_numbers: [2, 5, 7], mark: 'black' }
    ]);
    expect(updated[1]).toBe(second);
  });

  it('moves and deletes color marks', () => {
    const player = createPlayer('p-1', {
      color_protocol: [
        { seat_numbers: [1], mark: 'red' },
        { seat_numbers: [2], mark: 'black' },
        { seat_numbers: [3], mark: 'sheriff' }
      ]
    });

    const moved = moveColorMarkInResults([player], 'p-1', 2, 0);
    expect(moved[0].color_protocol.map((entry) => entry.mark)).toEqual([
      'sheriff',
      'red',
      'black'
    ]);

    const deleted = deleteColorMarkFromResults(moved, 'p-1', 1);
    expect(deleted[0].color_protocol.map((entry) => entry.mark)).toEqual([
      'sheriff',
      'black'
    ]);
  });

  it('creates and updates edit state without mutating the source entry', () => {
    const entry = { seat_numbers: [4, 1], mark: 'red' as const };
    const initial = createColorMarkEditState(0, entry);
    const withSeat = toggleColorMarkEditSeat(initial, 3);
    const withType = setColorMarkEditType(withSeat, 'sheriff');

    expect(withType).toEqual({
      index: 0,
      seats: [1, 3, 4],
      mark: 'sheriff'
    });
    expect(entry).toEqual({ seat_numbers: [4, 1], mark: 'red' });
  });

  it('saves edited marks with sorted seats', () => {
    const player = createPlayer('p-1', {
      color_protocol: [{ seat_numbers: [1], mark: 'red' }]
    });

    const updated = saveEditedColorMarkToResults([player], 'p-1', {
      index: 0,
      seats: [8, 2, 5],
      mark: 'black'
    });

    expect(updated[0].color_protocol).toEqual([
      { seat_numbers: [2, 5, 8], mark: 'black' }
    ]);
  });
});
