/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const tournament = {
  id: 't1', title: 'Турнир 3 октября', date: '2026-10-03T12:00:00.000Z', venue: 'Суп с Котом', status: 'draft',
  tournament_evening_flow: 1, organizer_player_id: 'owner', judge_player_id: 'judge',
  participants: [{ id: 'a' }, { id: 'b' }], games: [],
};
const sendSeatMessages = vi.fn(async () => ({ success: true, game_number: 1, players: 10, new_sent: 8, reached: 8, unreachable: 2 }));
vi.mock('../lib/api.ts', () => ({
  api: { getTournament: vi.fn(async () => tournament), getPlayers: vi.fn(async () => []), sendTournamentSeatMessages: sendSeatMessages },
}));
vi.mock('../components/crm/tournaments/TournamentEveningSettingsPanel.tsx', () => ({ TournamentEveningSettingsPanel: () => <div>ПАРАМЕТРЫ</div> }));
vi.mock('../components/crm/tournaments/TournamentParticipantsPanel.tsx', () => ({ TournamentParticipantsPanel: () => <div>УЧАСТНИКИ</div> }));
vi.mock('../components/crm/tournaments/TournamentDetailViewBase.tsx', () => ({
  TournamentDetailView: ({ tabs }: { tabs?: string[] }) => <div>ИГРЫ:{(tabs || ['all']).join(',')}</div>,
}));

const { TournamentDetailView } = await import('../components/crm/tournaments/TournamentDetailView.tsx');

describe('tournament step screen', () => {
  afterEach(() => cleanup());

  it('opens a tournament with registration on its next step and shows one step at a time', async () => {
    render(<TournamentDetailView tournamentId="t1" onBack={() => undefined} />);
    expect(await screen.findByText('УЧАСТНИКИ')).toBeTruthy();
    expect(screen.queryByText('ПАРАМЕТРЫ')).toBeNull();
    expect(screen.getByTestId('tournament-step-setup').textContent).toContain('✓');
    fireEvent.click(screen.getByTestId('tournament-step-games'));
    expect(screen.getByText('ИГРЫ:organization,games')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tournament-step-results'));
    expect(screen.getByText('ИГРЫ:standings,nominations')).toBeTruthy();
  });

  it('keeps the old screen for tournaments made the old way', async () => {
    tournament.tournament_evening_flow = 0;
    render(<TournamentDetailView tournamentId="t1" onBack={() => undefined} />);
    expect(await screen.findByText('ИГРЫ:all')).toBeTruthy();
    expect(screen.queryByTestId('tournament-steps')).toBeNull();
    tournament.tournament_evening_flow = 1;
  });

  it('shows the «send seats» block on the players and games steps once there are games to play', async () => {
    tournament.games = [{ id: 'g1', status: 'planned' }, { id: 'g2', status: 'planned' }] as any;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TournamentDetailView tournamentId="t1" onBack={() => undefined} />);
    expect(await screen.findByText('УЧАСТНИКИ')).toBeTruthy();
    expect(screen.getByTestId('tournament-seat-messages')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tournament-step-games'));
    fireEvent.click(screen.getByRole('button', { name: /Разослать места игрокам/ }));
    await waitFor(() => expect(sendSeatMessages).toHaveBeenCalledWith('t1'));
    expect(await screen.findByText(/отправлены в личные сообщения: 8 из 10 игроков/)).toBeTruthy();
    expect(screen.getByText(/У 2 из 10 нет привязанного Telegram\/VK/)).toBeTruthy();
    cleanup();

    tournament.games = [{ id: 'g1', status: 'completed' }] as any;
    render(<TournamentDetailView tournamentId="t1" onBack={() => undefined} />);
    expect(await screen.findByText('УЧАСТНИКИ')).toBeTruthy();
    expect(screen.queryByTestId('tournament-seat-messages')).toBeNull();
    tournament.games = [];
  });
});
