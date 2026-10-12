/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PlayerHomeDashboard from '../components/player/PlayerHomeDashboard.tsx';

vi.mock('../components/player/CuratorTasksCard.tsx', () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const base: any = {
  player: { id: 'p1', nickname: 'Игрок', elo: 1100 },
  games: {
    all: [
      { id: 'club:18', source: 'club', title: 'Игра на первом столе', date: '2026-10-10T18:00:00Z', role: 'sheriff', status: 'completed', won: true },
    ],
    stats: { completedGames: 1, totalGames: 1, winRate: 100, wins: 1, losses: 0 },
  },
};

describe('Home game shortcuts', () => {
  it('«Мои игры» opens the personal tab, while «Последняя игра» opens exactly its game key', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const onOpenGames = vi.fn();
    const onOpenMyGames = vi.fn();
    const onOpenGame = vi.fn();
    render(<PlayerHomeDashboard
      data={base}
      onOpenEvents={vi.fn()}
      onOpenGames={onOpenGames}
      onOpenMyGames={onOpenMyGames}
      onOpenGame={onOpenGame}
      onOpenRating={vi.fn()}
      onOpenWallet={vi.fn()}
      onOpenLearning={vi.fn()}
    />);
    fireEvent.click(screen.getByRole('button', { name: 'Мои игры' }));
    expect(onOpenMyGames).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Игра на первом столе/ }));
    expect(onOpenGame).toHaveBeenCalledWith('club:18');
    expect(onOpenGames).not.toHaveBeenCalled();
  });
});
