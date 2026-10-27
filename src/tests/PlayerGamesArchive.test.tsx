/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerGamesArchive from '../components/player/PlayerHistoryStatsView.tsx';

vi.mock('../components/player/PlayerGameDetail.tsx', () => ({
  default: ({ detail, onBack }: any) => <div data-testid="detail"><span>{detail ? detail.game.title : 'loading'}</span><button type="button" onClick={onBack}>← Назад к играм</button></div>,
}));

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const data: any = {
  player: { id: 'me' },
  games: { all: [
    { id: 'club:g1', source: 'club', title: 'Моя последняя игра', date: '2026-10-03T18:00:00.000Z', game_number: 4, role: 'sheriff', seat_number: 3, status: 'completed', won: true },
    { id: 'club:g0', source: 'club', title: 'Моя предыдущая игра', date: '2026-09-25T18:00:00.000Z', game_number: 1, role: 'citizen', seat_number: 8, status: 'completed', won: false },
  ] },
};
const detail = { game: { id: 'club:g1', source: 'club', title: 'Моя последняя игра', game_number: 4, date: null, format: 'STANDARD', winner_team: 'red', judge_name: null, table_name: null, elo_affected: true } };

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('personal games, club archive and the page of one game', () => {
  const stubFetch = () => vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/games/all')) return json({ games: [
      { id: 'club:g1', source: 'club', title: 'Моя последняя игра', date: '2026-10-03T18:00:00.000Z', game_number: 4, format: 'STANDARD', winner_team: 'red', judge_name: 'Иван' },
      { id: 'club:g2', source: 'club', title: 'Чужая игра в клубе', date: '2026-10-04T18:00:00.000Z', game_number: 5, format: 'STANDARD', winner_team: 'black', judge_name: 'Иван' },
    ] });
    if (url.includes('/api/player/games/club%3Ag1')) return json(detail);
    return json({}, 404);
  }));

  it('shows only the signed-in player games by default and opens their detail', async () => {
    stubFetch();
    const fetch = vi.mocked(globalThis.fetch);
    const onGameChange = vi.fn();
    render(<PlayerGamesArchive data={data} onGameChange={onGameChange} />);
    expect(screen.getByTestId('player-my-games')).toBeDefined();
    expect(screen.getByText(/Моя последняя игра/)).toBeDefined();
    expect(screen.getByText(/Моя предыдущая игра/)).toBeDefined();
    expect(screen.getAllByRole('button', { name: /Шериф.*Победа/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Мирный.*Поражение/ })).toHaveLength(1);
    expect(screen.queryByText('Чужая игра в клубе')).toBeNull();
    expect(fetch).not.toHaveBeenCalledWith('/api/player/games/all', expect.anything());

    fireEvent.click(screen.getByText(/Моя последняя игра/));
    expect(onGameChange).toHaveBeenCalledWith('club:g1');
    expect(await screen.findByTestId('detail')).toBeDefined();
    const replay = await screen.findByRole('button', { name: /Replay игры/ });
    const pop = vi.fn();
    window.addEventListener('popstate', pop);
    fireEvent.click(replay);
    expect(window.location.pathname).toBe('/player/replay/club%3Ag1');
    expect(pop).toHaveBeenCalledTimes(1);
    window.removeEventListener('popstate', pop);
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    fireEvent.click(screen.getByText('← Назад к играм'));
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('retains the original club-wide archive as an expandable alternative', async () => {
    stubFetch();
    render(<PlayerGamesArchive data={data} />);
    const summary = screen.getByText(/Все игры клуба/);
    const details = summary.closest('details')!;
    fireEvent.click(summary);
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(await screen.findByText('Чужая игра в клубе')).toBeDefined();
    expect(screen.getByText(/Моя предыдущая игра/)).toBeDefined();
    const archive = screen.getByTestId('player-club-archive');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Найти в архиве' }), { target: { value: 'Чужая' } });
    expect(within(archive).queryByText('Моя последняя игра')).toBeNull();
    expect(within(archive).getByText('Показано 1 из 2')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Найти в архиве' }), { target: { value: 'ничего такого' } });
    expect(within(archive).getByText(/По этому запросу игр не найдено/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить поиск' }));
    expect(within(archive).getByText('Моя последняя игра')).toBeTruthy();
    expect(within(archive).getByText('Чужая игра в клубе')).toBeTruthy();
  });

  it('searches the Moscow calendar day rather than the raw UTC day', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({games:[{id:'club:night',source:'club',title:'Ночная игра',date:'2026-10-03T22:30:00Z',game_number:41,format:'CASUAL',winner_team:'red',judge_name:null}]})));
    render(<PlayerGamesArchive data={data} />);
    const archive=screen.getByTestId('player-club-archive');
    (archive as HTMLDetailsElement).open=true;fireEvent(archive,new Event('toggle'));
    await within(archive).findByText('Ночная игра');
    const search=screen.getByRole('searchbox',{name:'Найти в архиве'});
    fireEvent.change(search,{target:{value:'2026-10-03'}});
    expect(within(archive).queryByText('Ночная игра')).toBeNull();
    fireEvent.change(search,{target:{value:'2026-10-04'}});
    expect(within(archive).getByText('Ночная игра')).toBeTruthy();
    fireEvent.change(search,{target:{value:'04.10.2026'}});
    expect(within(archive).getByText('Ночная игра')).toBeTruthy();
  });

  it('returns from a game to the opened archive and the same search', async () => {
    stubFetch();
    const view = render(<PlayerGamesArchive data={data} initialGameKey={null} />);
    const archive = screen.getByTestId('player-club-archive');
    (archive as HTMLDetailsElement).open = true;
    fireEvent(archive, new Event('toggle'));
    await within(archive).findByText('Моя последняя игра');
    fireEvent.change(screen.getByRole('searchbox', {name:'Найти в архиве'}), {target:{value:'последняя'}});
    fireEvent.click(within(archive).getByRole('button', {name:/Моя последняя игра/}));
    view.rerender(<PlayerGamesArchive data={data} initialGameKey="club:g1" />);
    await screen.findByTestId('detail');
    view.rerender(<PlayerGamesArchive data={data} initialGameKey={null} />);
    await screen.findByTestId('player-my-games');
    expect((screen.getByTestId('player-club-archive') as HTMLDetailsElement).open).toBe(true);
    expect((screen.getByRole('searchbox', {name:'Найти в архиве'}) as HTMLInputElement).value).toBe('последняя');
    expect(screen.getByTestId('player-club-archive').querySelectorAll('.player-archive-list button')).toHaveLength(1);
  });

  it('opens deep-linked club games and returns to personal games when URL loses target', async () => {
    stubFetch();
    const view = render(<PlayerGamesArchive data={data} initialGameKey="club:g1" />);
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toContain('Моя последняя игра'));
    view.rerender(<PlayerGamesArchive data={data} initialGameKey={null} />);
    expect(await screen.findByTestId('player-my-games')).toBeDefined();
  });

  it('shows a useful personal empty state without confusing it with an empty club archive', () => {
    stubFetch();
    const fetch = vi.mocked(globalThis.fetch);
    render(<PlayerGamesArchive data={{ ...data, games: { all: [] } }} />);
    expect(screen.getByText(/После первой завершённой игры/)).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
