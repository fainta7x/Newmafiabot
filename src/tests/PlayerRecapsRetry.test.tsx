/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerEveningSummaries from '../components/player/PlayerEveningSummaries.tsx';

const summary = {
  id: 'e1', title: 'Осенний вечер', starts_at: '2026-10-10T18:00:00+03:00',
  settled_at: '2026-10-10T22:00:00+03:00', venue: 'Клуб',
  games: 3, red_wins: 2, black_wins: 1, score: '2:1',
  player: { games: 2, wins: 1, losses: 1, win_rate: 50, elo_before: 1200, elo_after: 1203, elo_delta: 3, roles: ['red'] },
  best_elo_rise: null, most_games: null, awards: [], facts: [], game_ids: [],
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ЛК «Вечера → Прошедшие» in-page recovery', () => {
  it('links the actual game number and personal outcome, using no invented ordinal for legacy links', async () => {
    const onOpenGame = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => json({summaries:[{...summary, game_ids:['club:41','club:old'], game_links:[{id:'club:41',game_number:41,winner_team:'red',personal:{role:'sheriff',won:true}}]}]})));
    render(<PlayerEveningSummaries embedded initialEveningId="e1" onOpenGame={onOpenGame} />);
    const link = await screen.findByRole('button', {name:/Игра №41/});
    expect(link.textContent).toContain('Шериф · Победа');
    expect(screen.queryByRole('button', {name:/Игра №1(?:\D|$)/})).toBeNull();
    fireEvent.click(link);
    expect(onOpenGame).toHaveBeenCalledWith('club:41','e1');
    expect(screen.getByRole('button',{name:/Открыть игру/})).toBeTruthy();
  });

  it('shows a retry when embedded summaries fail, then restores the actual evening', async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async () => {
      attempts++;
      return attempts === 1
        ? json({ error: 'Сервис временно недоступен' }, 503)
        : json({ summaries: [summary] });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<PlayerEveningSummaries embedded />);

    const error = await screen.findByTestId('player-recaps-error');
    expect(error.textContent).toContain('Сервис временно недоступен');
    expect(screen.queryByText('Итогов пока нет')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(screen.getByText('Осенний вечер')).toBeDefined());
    expect(screen.queryByTestId('player-recaps-error')).toBeNull();
    expect(attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith('/api/player/evening-summaries', { credentials: 'include' });
  });

  it('does not mistake a confirmed empty history for a failed network request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ summaries: [] })));
    render(<PlayerEveningSummaries embedded />);
    await screen.findByText('Итогов пока нет');
    expect(screen.queryByTestId('player-recaps-error')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
  });

  it('keeps both retry and optional Back action for standalone error view', async () => {
    const back = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Нет соединения'); }));
    render(<PlayerEveningSummaries onBack={back} />);
    await screen.findByTestId('player-recaps-error');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(back).toHaveBeenCalledOnce();
  });
});
