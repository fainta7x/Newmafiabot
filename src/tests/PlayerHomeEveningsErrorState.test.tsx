/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerHomeDashboard from '../components/player/PlayerHomeDashboard.tsx';
import type { PlayerMeResponse } from '../types/player.ts';

vi.mock('../components/player/VotePromptCard.tsx', () => ({ default: () => null }));
vi.mock('../components/player/CuratorTasksCard.tsx', () => ({ default: () => null }));
vi.mock('../components/player/WhatsNewCard.tsx', () => ({ default: () => null }));

const fixture = {
  player: { id: 'p1', nickname: 'Аня', elo: 1000, tokens: 0 },
  games: { stats: { completedGames: 0, winRate: 0 }, all: [] },
} as unknown as PlayerMeResponse;

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});

const futureEvening = {
  id: 'friday', title: 'Игровая пятница', venue: 'Клуб',
  starts_at: '2027-10-15T18:00:00+03:00', format: 'CASUAL', status: 'published',
};

function renderHome(eveningsFetch: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn((input: string | URL) => {
    const url = String(input);
    if (url === '/api/player/evenings') return eveningsFetch();
    if (url === '/api/player/news') return Promise.resolve(response({ news: [] }));
    if (url === '/api/player/novice') return Promise.resolve(response({ player: null }));
    if (url === '/api/player/payments') return Promise.resolve(response({ summary: { historical_debt: 0 } }));
    if (url === '/api/rating') return Promise.resolve(response({ players: [] }));
    throw new Error(`Unexpected URL: ${url}`);
  }));
  const onOpenEvents = vi.fn();
  render(<PlayerHomeDashboard
    data={fixture}
    onOpenEvents={onOpenEvents}
    onOpenGames={vi.fn()}
    onOpenRating={vi.fn()}
  />);
  return { onOpenEvents };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('Player Cabinet Главная — ближайший вечер, ошибки запроса', () => {
  it('replaces endless loading on HTTP failure with actionable retry, then restores the evening link', async () => {
    let count = 0;
    const { onOpenEvents } = renderHome(async () => {
      count += 1;
      return count === 1 ? response({ error: 'unavailable' }, 503) : response({ evenings: [futureEvening] });
    });
    const error = await screen.findByTestId('player-home-evenings-error');
    expect(error.textContent).toContain('Не удалось загрузить расписание');
    expect(screen.queryByText('Ближайших игровых вечеров пока нет.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    const link = await screen.findByRole('button', { name: /Выбрать игры/ });
    expect(screen.getByText('Игровая пятница')).toBeDefined();
    expect(screen.queryByTestId('player-home-evenings-error')).toBeNull();
    fireEvent.click(link);
    expect(onOpenEvents).toHaveBeenCalledExactlyOnceWith('friday');
    expect(count).toBe(2);
  });

  it('reports a network failure instead of claiming there are no evenings', async () => {
    renderHome(async () => { throw new Error('Offline'); });
    expect((await screen.findByTestId('player-home-evenings-error')).textContent).toContain('Не удалось');
    expect(screen.queryByText('Ближайших игровых вечеров пока нет.')).toBeNull();
  });

  it('keeps the genuine empty state when the server successfully returns no evenings', async () => {
    renderHome(async () => response({ evenings: [] }));
    await waitFor(() => expect(screen.getByText('Ближайших игровых вечеров пока нет.')).toBeDefined());
    expect(screen.queryByTestId('player-home-evenings-error')).toBeNull();
  });

  it('handles an invalid successful response as unavailable schedule, not empty schedule', async () => {
    renderHome(async () => response({ something_else: [] }));
    expect((await screen.findByTestId('player-home-evenings-error')).textContent).toContain('Не удалось');
    expect(screen.queryByText('Ближайших игровых вечеров пока нет.')).toBeNull();
  });
});
