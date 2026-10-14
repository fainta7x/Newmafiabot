/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson } from '../lib/requestJson.ts';
import { openCanonicalPlayerProfile } from '../components/player/playerProfileNavigation.ts';
import PlayerClubDirectory from '../components/player/PlayerClubDirectory.tsx';

vi.mock('../lib/requestJson.ts', () => ({ getJson: vi.fn() }));
vi.mock('../components/player/playerProfileNavigation.ts', () => ({ openCanonicalPlayerProfile: vi.fn() }));

const members = [
  { id: 'p1', nickname: 'Анна', elo: 1550, game_level: 'tournament', avatar_url: null },
  { id: 'p2', nickname: 'Олег', elo: 1320, game_level: 'club', avatar_url: null },
  { id: 'p3', nickname: 'Марина', elo: 1100, game_level: 'novice', avatar_url: null },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ЛК «Сообщество → Игроки» native player directory', () => {
  it('shows full cards with level and Elo, highlights own profile, and opens canonical profiles', async () => {
    vi.mocked(getJson).mockResolvedValue({ players: members });
    render(<PlayerClubDirectory selfId="p2" />);
    const own = await screen.findByTestId('club-player-p2');
    expect(own.textContent).toContain('Олег');
    expect(own.textContent).toContain('Мой профиль');
    expect(own.textContent).toContain('Игрок клуба');
    expect(own.textContent).toContain('1320');
    expect(own.textContent).toContain('Elo');
    expect(screen.getByTestId('club-player-p1').textContent).toContain('Турнирный игрок');
    expect(screen.getByTestId('club-player-p3').textContent).toContain('Новичок');
    expect(screen.getAllByRole('button', { name: /Открыть профиль/ })).toHaveLength(3);
    fireEvent.click(screen.getByTestId('club-player-p1'));
    expect(openCanonicalPlayerProfile).toHaveBeenCalledExactlyOnceWith('p1');
  });

  it('filters names without hiding or modifying the underlying list', async () => {
    vi.mocked(getJson).mockResolvedValue({ players: members });
    render(<PlayerClubDirectory selfId="p2" />);
    await screen.findByTestId('club-player-p1');
    fireEvent.change(screen.getByTestId('club-search'), { target: { value: '  МаР  ' } });
    expect(screen.getByTestId('club-player-p3')).toBeDefined();
    expect(screen.queryByTestId('club-player-p1')).toBeNull();
    expect(screen.queryByTestId('club-player-p2')).toBeNull();
    expect(screen.getByText('Найдено: 1')).toBeDefined();
    fireEvent.change(screen.getByTestId('club-search'), { target: { value: '' } });
    expect(screen.getAllByRole('button', { name: /Открыть профиль/ })).toHaveLength(3);
  });

  it('offers retry on failed load without losing the entered search term', async () => {
    let attempts = 0;
    vi.mocked(getJson).mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Список временно недоступен');
      return { players: members };
    });
    render(<PlayerClubDirectory selfId="p2" />);
    const error = await screen.findByTestId('club-directory-error');
    expect(error.textContent).toContain('Список временно недоступен');
    fireEvent.change(screen.getByTestId('club-search'), { target: { value: 'Анна' } });
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(screen.getByTestId('club-player-p1')).toBeDefined());
    expect(screen.queryByTestId('club-player-p2')).toBeNull();
    expect(screen.queryByTestId('club-directory-error')).toBeNull();
    expect(attempts).toBe(2);
  });

  it('distinguishes an empty roster from zero search matches', async () => {
    vi.mocked(getJson).mockResolvedValue({ players: members });
    const { unmount } = render(<PlayerClubDirectory selfId="p2" />);
    await screen.findByTestId('club-player-p1');
    fireEvent.change(screen.getByTestId('club-search'), { target: { value: 'Неизвестный' } });
    expect(screen.getByText('Никого не нашли')).toBeDefined();
    unmount();
    vi.mocked(getJson).mockResolvedValue({ players: [] });
    render(<PlayerClubDirectory selfId="p2" />);
    await screen.findByText('Список игроков пока пуст');
    expect(screen.queryByText('Никого не нашли')).toBeNull();
  });
});
