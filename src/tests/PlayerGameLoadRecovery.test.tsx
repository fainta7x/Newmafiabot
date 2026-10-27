/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PlayerHistoryStatsView from '../components/player/PlayerHistoryStatsView.tsx';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('retries the same game and only offers Replay after its result loaded', async () => {
  const detail = { game: { id: 'club:11', source: 'club', game_number: 11, title: 'Нужная игра', format: 'CASUAL', date: null, winner_team: 'red', elo_affected: false }, players: [], protocol: { votes: [], shots: [], events: [], end_reason: 'normal' } };
  const fetchGame = vi.fn().mockResolvedValueOnce(json({ error: 'Игра временно недоступна' }, 503)).mockResolvedValueOnce(json(detail));
  vi.stubGlobal('fetch', fetchGame);
  render(<PlayerHistoryStatsView data={{ player: { id: 'me' }, games: { all: [] } } as any} initialGameKey="club:11" />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: /Replay игры/ })).toBeNull();
  expect(screen.getByRole('button', { name: '← Назад' })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await screen.findByText('Нужная игра');
  expect(screen.getByRole('button', { name: /Replay игры/ })).toBeDefined();
  expect(fetchGame.mock.calls.map(([url]) => url)).toEqual(['/api/player/games/club%3A11', '/api/player/games/club%3A11']);
});
