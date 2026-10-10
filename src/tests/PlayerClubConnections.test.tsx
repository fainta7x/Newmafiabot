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
it('labels single-game pairs as too early to judge and keeps personal lists out of the club view', async () => {
  setup({ teammates: [], club_duos: { red: [], black: [] }, club_first_games: { red: [{ ...duo, games: 1, wins: 1, win_rate: 100 }], black: [] }, rivals: [{ player_id: 'r', nickname: 'Личный соперник', games: 3, wins: 1, win_rate: 33, avatar_url: '' }] });
  const club = await screen.findByTestId('club-duos');
  expect(within(club).getByText(/рано судить/).closest('details')?.open).toBe(true);
  expect(screen.queryByText('Личный соперник')).toBeNull();
  expect(screen.queryByTestId('club-recent')).toBeNull();
});

it('shows six distinct club stories and switches accessible tabs without losing profile actions', async () => {
  setup({ rivals: [], teammates: [], club_stories: clubStoriesFixture, club_duos: { red: [], black: [] } });
  const stories = await screen.findByTestId('club-stories');
  expect(stories.parentElement?.firstElementChild).toBe(stories);
  expect(within(stories).getByText('Чёрные тройки')).toBeTruthy();
  expect(within(stories).getByText('Дон и мафия')).toBeTruthy();
  expect(within(stories).getByText('Шериф и мирный')).toBeTruthy();
  fireEvent.click(within(stories).getByRole('button', { name: 'Соперники' }));
  expect(within(stories).getByText('Равные соперники')).toBeTruthy();
  expect(within(stories).getByText('Играют вместе и за красных, и за чёрных')).toBeTruthy();
  expect(within(stories).queryByText('Чёрные тройки')).toBeNull();
  fireEvent.click(within(stories).getByRole('button', { name: 'Знакомства' }));
  expect(within(stories).getByText('Кто знает всех')).toBeTruthy();
  fireEvent.click(within(stories).getByRole('button', { name: 'Богданчик' }));
  expect(open).toHaveBeenCalledWith('p2');
  expect(within(stories).getByText(/Что здесь считается/)).toBeTruthy();
});
