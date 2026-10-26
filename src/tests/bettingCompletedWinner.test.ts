import { describe, expect, it } from 'vitest';
import { completedWinner } from '../server/services/bettingPoolService';

// Audit 2026-10-26: the betting pool reads a finished game's winner like the results and Elo do.
const row = (protocol_winner: string | null, game_winner_label: string | null, protocol_status = 'completed') =>
  ({ protocol_kind: 'club_evening_protocol', protocol_status, protocol_winner, game_winner_label });

describe('winner of a finished club game for the betting pool', () => {
  it('takes the protocol winner, then the games-row label in any spelling', () => {
    expect(completedWinner(row('red', 'Красные'))).toBe('red');
    expect(completedWinner(row(null, 'Чёрные'))).toBe('black');
    expect(completedWinner(row(null, 'Черные'))).toBe('black');
    expect(completedWinner(row(null, 'draft'))).toBeNull();
  });
  it('the protocol wins over a contradicting label, and a draft protocol settles nothing', () => {
    expect(completedWinner(row('black', 'Красные'))).toBe('black');
    expect(completedWinner(row('red', 'Красные', 'draft'))).toBeNull();
  });
});
