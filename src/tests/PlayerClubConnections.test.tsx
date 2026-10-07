/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { clubStoriesFixture } from '../../e2e/club-connection-stories.fixture.ts';
import PlayerClubConnections from '../components/player/PlayerClubConnections.tsx';
const open = vi.hoisted(() => vi.fn());
vi.mock('../components/player/playerProfileNavigation.ts', () => ({ openCanonicalPlayerProfile: open }));
const duo = { a_id: 'a', a_name: 'Анна', b_id: 'b', b_name: 'Борис', team: 'red', games: 4, wins: 3, win_rate: 75, a_avatar_url: '', b_avatar_url: '' };
function setup(data: unknown) { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data)))); render(<PlayerClubConnections />); }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); open.mockReset(); });
it('makes club pairs primary, switches the list and opens canonical profiles', async () => {
  setup({ rivals: [], teammates: [], club_duos: { red: [duo], black: [] }, club_most_played: { red: [{ ...duo, a_name: 'Вера', a_id: 'v' }], black: [] } });
  const club = await screen.findByTestId('club-duos');
  expect(club.parentElement?.firstElementChild).toBe(club);
  fireEvent.click(within(club).getByRole('button', { name: 'Анна' })); expect(open).toHaveBeenCalledWith('a');
  fireEvent.click(screen.getByRole('button', { name: 'Самые сыгранные' }));
  expect(within(club).getByRole('button', { name: 'Вера' })).toBeTruthy();
  expect(within(club).queryByRole('button', { name: 'Анна' })).toBeNull();
});
it('labels single-game samples and shows factual last-event encounters', async () => {
  const person = { player_id: 'b', nickname: 'Борис', games: 1, wins: 1, win_rate: 100, avatar_url: '' };
  setup({ rivals: [], teammates: [], club_duos: { red: [], black: [] }, club_first_games: { red: [{ ...duo, games: 1, wins: 1, win_rate: 100 }], black: [] }, recent_event: { title: 'Последний вечер', date: '2026-10-07T18:00:00Z', teammates: [person], rivals: [person] } });
  const club = await screen.findByTestId('club-duos');
  expect(within(club).getByText(/Рано делать выводы/).closest('details')?.open).toBe(true);
  expect(screen.getByTestId('club-recent').textContent).toContain('Последний вечер');
  expect(within(screen.getByTestId('club-recent')).getAllByText(/победа твоей команды/)).toHaveLength(2);
});

it('shows six distinct club stories and switches accessible tabs without losing profile actions', async () => {
  setup({ rivals: [], teammates: [], club_stories: clubStoriesFixture, club_duos: { red: [], black: [] } });
  const stories = await screen.findByTestId('club-stories');
  expect(stories.parentElement?.firstElementChild).toBe(stories);
  expect(within(stories).getByText('Чёрные тройки')).toBeTruthy();
  expect(within(stories).getByText('Дон + мафия')).toBeTruthy();
  expect(within(stories).getByText('Шериф + мирный')).toBeTruthy();
  fireEvent.click(within(stories).getByRole('button', { name: 'Две стороны' }));
  expect(within(stories).getByText('Ровные противостояния')).toBeTruthy();
  expect(within(stories).getByText('Вместе за оба цвета')).toBeTruthy();
  expect(within(stories).queryByText('Чёрные тройки')).toBeNull();
  fireEvent.click(within(stories).getByRole('button', { name: 'Круг игры' }));
  expect(within(stories).getByText('Разные составы')).toBeTruthy();
  fireEvent.click(within(stories).getByRole('button', { name: 'Богданчик' }));
  expect(open).toHaveBeenCalledWith('p2');
  expect(within(stories).getByText(/Порог игр — условие показа/)).toBeTruthy();
});
