/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerTournamentView from '../components/player/PlayerTournamentView';
import PlayerTournamentResults from '../components/player/PlayerTournamentResults';

const base = {
  tournament: { id: 't1', title: 'Осенний турнир', date: '2026-10-03T16:00:00Z', venue: 'Бар', stage: null, phase: 'live', judge: 'Чагин', organizer: 'Богданчик', entry_fee_rub: 0, prize_fund_rub: 0, games_planned: 2, games_completed: 1 },
  registration: { capacity: 10, confirmed_count: 2, reserve_count: 0, open: false, mine: null, participated: false },
  roster: [{ number: 1, nickname: 'Аня', is_me: false }, { number: 2, nickname: 'Боря', is_me: false }],
  games: [
    { game_number: 1, status: 'completed', winner_team: 'red', judge: 'Чагин', seats: [{ seat: 1, nickname: 'Аня', role: 'mafia', is_me: false }, { seat: 2, nickname: 'Боря', role: 'citizen', is_me: false }] },
    { game_number: 2, status: 'active', winner_team: null, judge: 'Чагин', seats: [{ seat: 1, nickname: 'Аня', role: null, is_me: false }] },
  ],
  table_hidden: false, provisional: true,
  standings: [{ place: 1, nickname: 'Аня', is_me: false, games_played: 1, wins: 1, total_points: 3.5, additional_total: 0.5 }],
  nominations: [{ category: 'best_player', title: 'Лучший игрок', has_tie: false, leader: { nickname: 'Аня', points: 1 }, candidates: [{ nickname: 'Аня', points: 1 }] }],
};
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('player tournament view (owner, 2026-10-06)', () => {
  it('opens a running tournament on its live table and nominations, with roles of finished games only', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(base)));
    render(<PlayerTournamentView tournamentId="t1" onBack={() => undefined} />);
    expect(await screen.findByTestId('player-tournament-standings')).toBeTruthy();
    expect(screen.getByText('промежуточная')).toBeTruthy();
    expect(screen.getByTestId('player-tournament-nominations').textContent).toContain('Лучший игрок');
    fireEvent.click(screen.getByTestId('player-tournament-tab-games'));
    const games = screen.getByTestId('player-tournament-games');
    expect(games.textContent).toContain('Мафия');
    expect(games.textContent).toContain('Роли откроются после игры');
    fireEvent.click(screen.getByTestId('player-tournament-tab-roster'));
    expect(screen.getByTestId('player-tournament-roster').textContent).toContain('Боря');
  });

  it('shows only a notice instead of the table and nominations while the organizer has closed the table', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ ...base, table_hidden: true, standings: null, nominations: null })));
    render(<PlayerTournamentView tournamentId="t1" onBack={() => undefined} />);
    expect(await screen.findByTestId('player-tournament-table-hidden')).toBeTruthy();
    expect(screen.queryByTestId('player-tournament-standings')).toBeNull();
    expect(screen.queryByTestId('player-tournament-nominations')).toBeNull();
    fireEvent.click(screen.getByTestId('player-tournament-tab-roster'));
    expect(screen.getByTestId('player-tournament-roster').textContent).toContain('Аня');
  });

  it('retries after a failed load', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(() => (++calls === 1 ? json({ error: 'Нет связи' }, 500) : json(base))));
    render(<PlayerTournamentView tournamentId="t1" onBack={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Повторить' }));
    expect(await screen.findByTestId('player-tournament-standings')).toBeTruthy();
  });

  it('lists tournaments by phase and opens one', async () => {
    const list = { tournaments: [
      { id: 't1', title: 'Идущий', date: '2026-10-03T16:00:00Z', venue: null, phase: 'live', capacity: 10, confirmed_count: 10, my_registration: null, participated: false },
      { id: 't0', title: 'Прошлый', date: '2026-08-01T16:00:00Z', venue: null, phase: 'finished', capacity: 10, confirmed_count: 10, my_registration: null, participated: true },
    ] };
    vi.stubGlobal('fetch', vi.fn((url: string) => (String(url).endsWith('/api/player/tournaments') ? json(list) : json(base))));
    render(<PlayerTournamentResults />);
    const items = await screen.findAllByTestId('player-tournament-item');
    expect(items.map((item) => item.textContent)).toEqual([expect.stringContaining('Идущий'), expect.stringContaining('вы играли')]);
    fireEvent.click(items[0]);
    await waitFor(() => expect(screen.getByTestId('player-tournament-view')).toBeTruthy());
  });
});
