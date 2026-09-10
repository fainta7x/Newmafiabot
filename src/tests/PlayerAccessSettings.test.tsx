/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerAccessSettings } from '../components/crm/PlayerAccessSettings.tsx';

const player = {
  id: 'player-1',
  nickname: 'Очень длинный ник игрока для мобильной карточки',
  game_level: 'unrated',
  club_role: 'member',
  judge_level: 'none',
  organizer_player_access: false,
} as any;

const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PlayerAccessSettings', () => {
  it('keeps the editor and chosen values visible after a server validation failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => response({ error: 'Validation error' }, 400)));
    render(<PlayerAccessSettings player={player} />);

    fireEvent.click(screen.getByTestId('crm-player-access-edit'));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'tournament' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    expect(await screen.findByTestId('crm-player-access-error')).toBeDefined();
    expect(screen.getByTestId('crm-player-access-sheet')).toBeDefined();
    expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('tournament');
  });

  it('accepts success only after canonical refetch matches and refreshes the parent profile/list', async () => {
    const onSaved = vi.fn();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return response({ ...player, game_level: 'club', club_role: 'team', judge_level: 'host' });
      }
      return response({ ...player, game_level: 'club', club_role: 'team', judge_level: 'host', organizer_player_access: false });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<PlayerAccessSettings player={player} onSaved={onSaved} />);

    fireEvent.click(screen.getByTestId('crm-player-access-edit'));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'club' } });
    fireEvent.change(selects[1], { target: { value: 'team' } });
    fireEvent.change(selects[2], { target: { value: 'host' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('crm-player-access-success').textContent).toContain('подтверждены повторным чтением');
    expect(screen.queryByTestId('crm-player-access-sheet')).toBeNull();
  });

  it('treats a successful PATCH with mismatching persisted readback as an error', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      call += 1;
      if (call === 1) return response({ ...player, game_level: 'tournament' });
      return response({ ...player, game_level: 'unrated' });
    }));
    render(<PlayerAccessSettings player={player} />);

    fireEvent.click(screen.getByTestId('crm-player-access-edit'));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'tournament' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }));

    const error = await screen.findByTestId('crm-player-access-error');
    expect(error.textContent).toContain('повторное чтение вернуло другие значения');
    expect(screen.getByTestId('crm-player-access-sheet')).toBeDefined();
  });

  it('preserves dirty classification fields when CRM access changes and the parent refetches the same player', async () => {
    const onSaved = vi.fn();
    const fetchMock = vi.fn(() => response({ organizer_player_access: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = render(<PlayerAccessSettings player={player} onSaved={onSaved} />);

    fireEvent.click(screen.getByTestId('crm-player-access-edit'));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'tournament' } });
    fireEvent.click(screen.getByRole('button', { name: 'Выдать доступ к CRM' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Выдать доступ' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(onSaved).not.toHaveBeenCalled();
    expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('tournament');

    rerender(<PlayerAccessSettings player={{ ...player, organizer_player_access: true }} onSaved={onSaved} />);

    expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('tournament');
    expect(within(screen.getByTestId('crm-player-access-summary')).getByText('Есть доступ')).toBeDefined();
  });
});