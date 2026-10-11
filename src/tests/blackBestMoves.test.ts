import { describe, expect, it } from 'vitest';
import { blackParticipantIds, withoutBlackBestMoves, withoutBlackLegacyBestMove } from '../server/services/blackBestMoves.ts';

describe('best moves of black players (owner, 2026-10-10)', () => {
  const players = [
    { participant_id: 'a', role: 'mafia' },
    { participant_id: 'b', role: 'don' },
    { participant_id: 'c', role: 'citizen' },
    { participant_id: 'd', role: 'sheriff' },
  ];
  const black = blackParticipantIds(players);

  it('finds black participants only', () => {
    expect([...black].sort()).toEqual(['a', 'b']);
  });

  it('drops black best moves and keeps red ones', () => {
    const kept = withoutBlackBestMoves([{ participant_id: 'a' }, { participant_id: 'c' }], black);
    expect(kept).toEqual([{ participant_id: 'c' }]);
    expect(withoutBlackBestMoves(undefined, black)).toEqual([]);
  });

  it('clears the legacy single best move of a black player only', () => {
    const cleared = withoutBlackLegacyBestMove({ best_move_participant_id: 'a', best_move_source: 'first_killed', best_move_seats: [1, 2, 3] }, black);
    expect(cleared).toMatchObject({ best_move_participant_id: null, best_move_source: null, best_move_seats: [] });
    const red = { best_move_participant_id: 'c', best_move_seats: [4] };
    expect(withoutBlackLegacyBestMove(red, black)).toBe(red);
  });
});
