/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlayerWalletHub from '../components/player/PlayerWalletHub.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('wallet betting navigation', () => {
  it('opens bets directly and requests the active pool even when economy loading fails', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/player/bets')) {
        return { ok: true, json: async () => ({
          balance: 800, active: null, blocked: null, history: [],
          club_stats: { games: 0, black_wins: 0, red_wins: 0, black_win_rate: null, red_win_rate: null },
        }) } as Response;
      }
      if (url.includes('/api/player/economy')) {
        return { ok: false, json: async () => ({ error: 'Economy temporarily unavailable' }) } as Response;
      }
      return { ok: true, json: async () => ({ summary: { historical_debt: 0 }, items: [] }) } as Response;
    });
    render(<PlayerWalletHub data={{} as any} tokenBalance={800} onBalanceChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ставки/ }));
    expect(await screen.findByText('Сейчас нет игры с открытыми ставками.')).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/player/bets'))).toBe(true));
    expect(screen.queryByText('Ищем активную игру…')).toBeNull();
  });
});
