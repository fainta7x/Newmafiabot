/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerRatingTable from '../components/player/PlayerRatingTable.tsx';
import { openCanonicalPlayerProfile } from '../components/player/playerProfileNavigation.ts';

vi.mock('../components/player/playerProfileNavigation.ts', () => ({
  openCanonicalPlayerProfile: vi.fn(),
}));

const players = [
  { place: 4, player_id: 'p4', nickname: 'Марина', elo: 1480, avatar_url: null },
  { place: 1, player_id: 'p1', nickname: 'Анна', elo: 1610, avatar_url: null },
  { place: 3, player_id: 'p3', nickname: 'Олег', elo: 1510, avatar_url: null },
  { place: 2, player_id: 'p2', nickname: 'Борис', elo: 1560, avatar_url: null },
];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ЛК «Сообщество → Рейтинг → Elo»: карточки и навигация', () => {
  it('separates my standing, podium leaders, other people and preserves every profile link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ players })));
    render(<PlayerRatingTable playerId="p4" />);
    expect((await screen.findByTestId('rating-self-card')).textContent).toContain('Моё место');
    const leaders = screen.getByTestId('rating-leaders');
    const others = screen.getByTestId('rating-other-players');
    expect(within(leaders).getAllByRole('button').map((button) => button.textContent)).toEqual([
      expect.stringContaining('Анна'),
      expect.stringContaining('Борис'),
      expect.stringContaining('Олег'),
    ]);
    expect(within(others).getAllByRole('button')).toHaveLength(1);
    expect(within(others).getByRole('button').textContent).toContain('Марина');
    expect(screen.getByTestId('rating-self-row').textContent).toContain('1480');
    expect(screen.getAllByRole('button', { name: /Открыть профиль/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: /Открыть профиль Борис/ }));
    expect(openCanonicalPlayerProfile).toHaveBeenCalledExactlyOnceWith('p2');
    fireEvent.click(screen.getByTestId('rating-self-card'));
    expect(openCanonicalPlayerProfile).toHaveBeenCalledWith('p4');
  });

  it('keeps tied third-place players in the leaders collection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ players: [
      { place: 1, player_id: 'a', nickname: 'А', elo: 1600 },
      { place: 3, player_id: 'b', nickname: 'Б', elo: 1510 },
      { place: 3, player_id: 'c', nickname: 'В', elo: 1510 },
      { place: 5, player_id: 'd', nickname: 'Г', elo: 1500 },
    ] })));
    render(<PlayerRatingTable playerId="missing" />);
    const leaders = await screen.findByTestId('rating-leaders');
    expect(within(leaders).getAllByRole('button')).toHaveLength(3);
    expect(screen.getByTestId('rating-other-players')).toBeDefined();
    expect(screen.queryByTestId('rating-self-card')).toBeNull();
  });

  it('shows an actionable error and restores the cards after retry', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      attempts += 1;
      return attempts === 1 ? json({ error: 'Временно недоступно' }, 503) : json({ players });
    }));
    render(<PlayerRatingTable playerId="p4" />);
    const error = await screen.findByTestId('rating-load-error');
    expect(error.textContent).toContain('Временно недоступно');
    expect(screen.queryByTestId('rating-leaders')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(screen.getByTestId('rating-leaders')).toBeDefined());
    expect(screen.queryByTestId('rating-load-error')).toBeNull();
    expect(attempts).toBe(2);
  });

  it('keeps a successful empty ranking distinct from an unavailable response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ players: [] })));
    render(<PlayerRatingTable playerId="p4" />);
    await screen.findByText('Рейтинг пока пуст.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('rating-self-card')).toBeNull();
  });
});
