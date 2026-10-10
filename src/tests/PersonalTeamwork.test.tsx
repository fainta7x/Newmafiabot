/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react';
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
  expect(within(screen.getByTestId('role-pairs')).getByText(/Когда ты дон/)).toBeTruthy();
  expect(within(screen.getByTestId('role-pairs')).getByText(/Чаще всего мафия/)).toBeTruthy();
  expect(within(screen.getByTestId('my-opponents')).getByText('Сложные соперники')).toBeTruthy();
  expect(within(screen.getByTestId('known-steps')).getByText(/Ещё 1 игра в одной команде — и вы «напарники»/)).toBeTruthy();
  expect(within(screen.getByTestId('never-played')).getByText('Дарья')).toBeTruthy();
});

it('renders nothing when the data cannot be loaded', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
  const { container } = render(<PersonalTeamwork />);
  await new Promise<void>((resolve) => { setTimeout(resolve, 20); });
  expect(container.textContent).toBe('');
});
