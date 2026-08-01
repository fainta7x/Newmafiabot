// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TournamentDetailView } from '../components/crm/tournaments/TournamentDetailView';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: {
    getTournament: vi.fn(),
    updateGameRoles: vi.fn(),
    updateGameJudge: vi.fn(),
  },
}));

describe('TournamentDetailView Mobile Seating Layout', () => {
  it('renders full player nickname without truncation and exposes a full-width role selector', async () => {
    const mockTournament = {
      id: 'tourn-1',
      title: 'Турнир Тест',
      date: '2026-08-01T12:00:00Z',
      status: 'draft',
      start_readiness: { ready: true, errors: [] },
      complete_readiness: { isReady: false, errors: [] },
      participants: [
        {
          id: 'part-1',
          participant_number: 1,
          display_name: 'Фандорин ДлинныйНикнейм',
          player_nickname: 'Фандорин ДлинныйНикнейм',
        },
      ],
      games: [
        {
          id: 'game-1',
          game_number: 1,
          status: 'planned',
          judge_name: 'Судья',
          seats: [
            {
              id: 'seat-1',
              seat_number: 1,
              participant_id: 'part-1',
              display_name: 'Фандорин ДлинныйНикнейм',
              role: null,
            },
          ],
        },
      ],
    };

    (api.getTournament as any).mockResolvedValue(mockTournament);

    render(<TournamentDetailView tournamentId="tourn-1" onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText('Турнир Тест')).toBeTruthy();
    });

    screen.getByRole('button', { name: /Игры/i }).click();

    await waitFor(() => {
      expect(screen.getByText('Фандорин ДлинныйНикнейм')).toBeTruthy();
    });

    const playerName = screen.getByText('Фандорин ДлинныйНикнейм');
    expect(playerName.className).not.toContain('truncate');
    expect(playerName.className).toContain('break-words');

    const roleSelect = screen.getByRole('combobox', {
      name: /Роль для места 1: Фандорин ДлинныйНикнейм/i,
    });
    expect(roleSelect.className).toContain('w-full');
    expect(roleSelect.className).toContain('min-h-[44px]');
  });
});
