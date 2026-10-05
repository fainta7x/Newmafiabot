/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerGamesArchive from '../components/player/PlayerHistoryStatsView.tsx';

vi.mock('../components/player/PlayerGameDetail.tsx', () => ({
  default: ({ detail, onBack }: any) => <div data-testid="detail"><span>{detail ? detail.game.title : 'loading'}</span><button type="button" onClick={onBack}>← Назад к играм</button></div>,
}));

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const data: any = { player: { id: 'me' } };
const detail = { game: { id: 'club:g1', source: 'club', title: 'Вечер 3 октября', game_number: 4, date: null, format: 'STANDARD', winner_team: 'red', judge_name: null, table_name: null, elo_affected: true } };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('games archive and the page of one game', () => {
  const stubFetch = () => vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/games/all')) return json({ games: [{ id: 'club:g1', source: 'club', title: 'Вечер 3 октября', date: '2026-10-03T18:00:00.000Z', game_number: 4, format: 'STANDARD', winner_team: 'red', judge_name: 'Иван' }] });
    if (url.includes('/api/player/games/club%3Ag1')) return json(detail);
    return json({}, 404);
  }));

  it('lists the club games and tells the shell which game was opened and closed', async () => {
    stubFetch();
    const onGameChange = vi.fn();
    render(<PlayerGamesArchive data={data} onGameChange={onGameChange} />);
    fireEvent.click(await screen.findByText('Вечер 3 октября'));
    expect(onGameChange).toHaveBeenCalledWith('club:g1');
    expect(await screen.findByTestId('detail')).toBeDefined();
    expect(await screen.findByRole('link', { name: /Replay игры/ })).toBeDefined();
    fireEvent.click(screen.getByText('← Назад к играм'));
    expect(onGameChange).toHaveBeenLastCalledWith(null);
    expect(await screen.findByText('Все игры клуба')).toBeDefined();
  });

  it('opens the game named by the address and closes it when the address loses it', async () => {
    stubFetch();
    const view = render(<PlayerGamesArchive data={data} initialGameKey="club:g1" />);
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toContain('Вечер 3 октября'));
    view.rerender(<PlayerGamesArchive data={data} initialGameKey={null} />);
    expect(await screen.findByText('Все игры клуба')).toBeDefined();
  });
});
