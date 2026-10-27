/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PersonalTeamwork from '../components/player/PersonalTeamwork.tsx';

const p = (id: string, nickname: string, games = 4, wins = 3) => ({ player_id: id, nickname, avatar_url: '', games, wins, win_rate: 75 });
const body = {
  my_team: { red: [p('a', 'Анна')], black: [] },
  role_pairs: [{ my_role: 'don', games: 5, partners: [{ ...p('b', 'Борис'), partner_role: 'mafia' }] }],
  opponents: { hard: [p('c', 'Вера', 5, 1)], easy: [] },
  stages: { counts: { acquaintance: 2, teammates: 1, tandem: 0 }, closest: [{ player_id: 'd', nickname: 'Глеб', avatar_url: '', stage: 'acquaintance', shared_games: 3, same_team_games: 2, games_to_next: 1 }] },
  never_played: [{ player_id: 'e', nickname: 'Дарья', avatar_url: '', recent_games: 3 }],
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows the personal team views in plain words', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
  render(<PersonalTeamwork />);
  const team = await screen.findByTestId('my-team');
  expect(within(team).getByText('Анна')).toBeTruthy();
  expect(within(team).getByText('Пока ни с кем.')).toBeTruthy();
  expect(within(screen.getByTestId('role-pairs')).getByText(/Роль: дон/i)).toBeTruthy();
  expect(within(screen.getByTestId('role-pairs')).getByText(/Чаще всего мафия/i)).toBeTruthy();
  expect(within(screen.getByTestId('my-opponents')).getByText('Сложные соперники')).toBeTruthy();
  expect(within(screen.getByTestId('known-steps')).getByText(/Ещё 1 игра в одной команде до ступени «напарники»/)).toBeTruthy();
  expect(within(screen.getByTestId('never-played')).getByText('Дарья')).toBeTruthy();
});

it('reports a failed load and retries without leaving the team view', async () => {
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('{}', {status:500})).mockResolvedValueOnce(new Response(JSON.stringify(body)));
  vi.stubGlobal('fetch',fetcher);
  render(<PersonalTeamwork />);
  expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить сыгранность');
  fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку команды'}));
  expect(within(await screen.findByTestId('my-team')).getByText('Анна')).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});
