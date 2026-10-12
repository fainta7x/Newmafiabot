// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PokerDeskSidebar from '../components/player/PokerDeskSidebar.tsx';

afterEach(() => cleanup());

const players = [
  { id: 'me', nickname: 'Чагин', seat: 1, chips: 980 },
  { id: 'bot', nickname: 'Бот Лаки', seat: 2, chips: 1080 },
];
const hand = {
  street: 'flop', pot: 120, current_seat: 2,
  players: [{ id: 'me', chips: 900, folded: false }, { id: 'bot', chips: 1000, folded: true }],
  action_log: [
    { type: 'small_blind', street: 'preflop', player_id: 'me', at: 1 },
    { type: 'raise', street: 'preflop', player_id: 'bot', at: 2 },
    { type: 'call', street: 'preflop', player_id: 'me', at: 3 },
    { type: 'check', street: 'flop', player_id: 'me', at: 4 },
  ],
};

describe('PokerDeskSidebar', () => {
  it('shows the course of the hand by street, without blinds, and the stacks of the hand', () => {
    render(<PokerDeskSidebar hand={hand} players={players} viewerId="me" title="Тренировка" describe={(entry) => `${entry.type} ${entry.player_id}`} />);
    expect(screen.getByText('Флоп', { selector: 'h2' })).toBeTruthy();
    expect(screen.getByText(/Банк 120/)).toBeTruthy();
    expect(screen.queryByText(/small_blind/)).toBeNull();
    expect(screen.getByText('raise bot')).toBeTruthy();
    expect(screen.getAllByText('Префлоп').length).toBeGreaterThan(0);
    expect(screen.getByText('900')).toBeTruthy();
    expect(screen.getByText(/Бот Лаки · ходит · пас/)).toBeTruthy();
  });
});
