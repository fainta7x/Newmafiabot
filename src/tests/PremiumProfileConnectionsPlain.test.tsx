/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PremiumProfileConnections from '../components/player/PremiumProfileConnections.tsx';

const link = (id: string, nickname: string, same: number, against: number) => ({
  player_id: id, nickname, avatar_url: '', same_team_games: same, opponent_games: against, shared_games: same + against,
  same_team_wins: Math.floor(same / 2), same_team_win_rate: same ? (Math.floor(same / 2) / same) * 100 : 0,
  relationship: same > against ? 'Часто в одной команде' : 'Часто по разные стороны', last_shared_game_date: null,
});

function mockApi() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/connections')) return new Response(JSON.stringify({ connections: [link('a', 'Анна', 5, 1), link('b', 'Борис', 1, 6)], most_successful_partnership: link('a', 'Анна', 5, 1) }));
    if (String(url).includes('/api/player/relationships')) return new Response(JSON.stringify({ recent_event: null }));
    if (String(url).includes('invitation-context')) return new Response(JSON.stringify({ can_invite: false, evenings: [] }));
    return new Response(JSON.stringify({ invitations: [] }));
  }));
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows one plain personal list with Напарники / Соперники filters and no rule-book wording', async () => {
  mockApi();
  render(<PremiumProfileConnections playerId="me" selfPlayerId="me" />);
  expect(await screen.findByText('С кем ты играешь')).toBeTruthy();
  expect(screen.getByText('Лучший напарник')).toBeTruthy();
  expect(screen.getByText('Вместе выиграли 2 из 5 игр (40%)')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/Только факты|скрытого рейтинга|выборк/);

  fireEvent.click(screen.getByRole('button', { name: 'Соперники' }));
  const rows = screen.getAllByRole('button').map((button) => button.textContent || '').filter((text) => text.includes('друг против друга'));
  expect(rows[0]).toContain('Борис');
  expect(rows[1]).toContain('Анна');
  fireEvent.click(screen.getByRole('button', { name: 'Напарники' }));
  expect(screen.getAllByText(/в одной команде/).length).toBeGreaterThan(0);
});

it('speaks about the other player when viewing someone else', async () => {
  mockApi();
  render(<PremiumProfileConnections playerId="other" selfPlayerId="me" />);
  expect(await screen.findByText('С кем играет игрок')).toBeTruthy();
});
