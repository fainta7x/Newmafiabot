/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PlayerEveningWorkspace from '../components/player/PlayerEveningWorkspace.tsx';

vi.mock('../components/player/playerProfileNavigation.ts', () => ({
  openCanonicalPlayerProfile: vi.fn(),
}));

const overview = {
  evening: { id: 'eve', title: 'Friday', status: 'active', capacity: 20 },
  participation: { response_status: 'going', registration_status: 'confirmed', attendance_status: 'attended', can_change_selection: false },
  roster: [
    { player_id: 'self', nickname: 'Мой ник', table_id: 'a', response_status: 'going', attendance_status: 'attended', is_self: true },
    { player_id: 'other', nickname: 'Другой игрок', table_id: 'b', response_status: 'going', attendance_status: 'attended', is_self: false },
  ],
  tables: [
    { id: 'a', name: 'Стол А', host_name: 'Ведущий А', capacity: 10, players: [] },
    { id: 'b', name: 'Стол Б', host_name: 'Ведущий Б', capacity: 10, players: [] },
  ],
  games: [
    { id: 1, game_key: null, local_number: 1, global_number: 1, table_id: 'a', table_name: 'Стол А', status: 'draft', winner_team: null, judge_name: 'Ведущий А', self_seat: 4, players: [{ seat_number: 4, nickname: 'Мой ник', player_id: 'self' }] },
    { id: 2, game_key: null, local_number: 2, global_number: 2, table_id: 'b', table_name: 'Стол Б', status: 'draft', winner_team: null, judge_name: 'Ведущий Б', self_seat: null, players: [{ seat_number: 4, nickname: 'Другой игрок', player_id: 'other' }] },
    { id: 3, game_key: 'club:3', local_number: 3, global_number: 3, table_id: 'a', table_name: 'Стол А', status: 'completed', winner_team: 'red', judge_name: 'Ведущий А', self_seat: 4, players: [{ seat_number: 4, nickname: 'Мой ник', player_id: 'self' }] },
  ],
  score: { red: 1, black: 0, completed: 1, running: 2 },
};

describe('PlayerEveningWorkspace', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('renders both tables, safely distinguishes identical seat numbers and opens a completed protocol', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => overview,
    } as Response);
    const open = vi.fn();
    render(<PlayerEveningWorkspace eveningId="eve" onOpenGame={open} />);

    expect(await screen.findByText('Участники и рассадка · 2')).toBeTruthy();
    expect(screen.getByText('Игра 1 · Стол А')).toBeTruthy();
    expect(screen.getByText('Игра 2 · Стол Б')).toBeTruthy();
    expect(screen.getByText('Игра 3 · Стол А')).toBeTruthy();
    const self = screen.getAllByText('#4 Мой ник')[0];
    const other = screen.getByText('#4 Другой игрок');
    expect(self.className).toContain('emerald');
    expect(other.className).not.toContain('emerald');
    expect(screen.queryByText('Дон')).toBeNull();
    const link = screen.getByRole('link', { name: /Протокол/ });
    fireEvent.click(link);
    expect(open).toHaveBeenCalledWith('club:3', 'eve');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/player/evenings/eve/overview', expect.objectContaining({ credentials: 'include' }));
  });
});
