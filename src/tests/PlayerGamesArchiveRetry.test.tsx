/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson } from '../lib/requestJson.ts';
import PlayerHistoryStatsView from '../components/player/PlayerHistoryStatsView.tsx';
import type { PlayerMeResponse } from '../types/player.ts';

vi.mock('../lib/requestJson.ts', () => ({ getJson: vi.fn() }));
vi.mock('../components/player/PlayerGameDetail.tsx', () => ({ default: () => null }));

const data = {
  player: { id: 'p1', nickname: 'Аня', elo: 1200 },
  games: { all: [] },
} as unknown as PlayerMeResponse;

const clubGame = {
  id: 'club:game-1', source: 'club', title: 'Первая партия',
  date: '2026-10-10T20:00:00+03:00', game_number: 1,
  format: 'CASUAL', winner_team: 'red', judge_name: 'Ведущий',
};

async function openArchive() {
  const details = screen.getByText('Все игры клуба').closest('details');
  if (!details) throw new Error('Club archive disclosure not mounted');
  await act(async () => {
    details.open = true;
    fireEvent(details, new Event('toggle'));
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ЛК «Вечера → Мои игры» secondary archive retry', () => {
  it('recovers from a transient GET failure and shows the returned game', async () => {
    let attempts = 0;
    vi.mocked(getJson).mockImplementation(async () => {
      attempts++;
      if (attempts === 1) throw new Error('Нет доступа к архиву');
      return { games: [clubGame] };
    });
    render(<PlayerHistoryStatsView data={data} />);
    await openArchive();
    const error = await screen.findByTestId('player-games-archive-error');
    expect(error.textContent).toContain('Нет доступа к архиву');
    expect(screen.getByText('Мои игры')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(screen.getByText('Первая партия')).toBeDefined());
    expect(screen.queryByTestId('player-games-archive-error')).toBeNull();
    expect(attempts).toBe(2);
  });

  it('distinguishes an actual empty completed archive from a failed request', async () => {
    vi.mocked(getJson).mockResolvedValue({ games: [] } as any);
    render(<PlayerHistoryStatsView data={data} />);
    await openArchive();
    await screen.findByText('Завершённых игр пока нет.');
    expect(screen.queryByTestId('player-games-archive-error')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
  });

  it('clears the prior error if the archive is closed and opened again', async () => {
    let attempts = 0;
    vi.mocked(getJson).mockImplementation(async () => {
      attempts++;
      if (attempts === 1) throw new Error('Сбой сервиса');
      return { games: [clubGame] };
    });
    render(<PlayerHistoryStatsView data={data} />);
    await openArchive();
    await screen.findByTestId('player-games-archive-error');
    const details = screen.getByText('Все игры клуба').closest('details')!;
    await act(async () => { details.open = false; fireEvent(details, new Event('toggle')); });
    await openArchive();
    await screen.findByText('Первая партия');
    expect(screen.queryByTestId('player-games-archive-error')).toBeNull();
    expect(attempts).toBe(2);
  });
});
