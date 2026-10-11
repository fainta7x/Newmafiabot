// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EveningGameProtocolModal } from '../components/crm/EveningGameProtocolModal.tsx';
import { clubGamesApi } from '../lib/clubGamesApi.ts';

const ROLES = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'];
const makeGame = (status: 'draft' | 'completed', winner: 'red' | null = null): any => ({
  id: 7, global_game_number: 7, table_name: 'Стол 1', judge_name: 'Судья',
  club_protocol: {
    protocol: { game_id: '7', status, winner_team: winner, votes: [], shots: [], best_moves: [], best_move_seats: [] },
    player_results: ROLES.map((role, i) => ({
      participant_id: `p${i + 1}`, seat_number: i + 1, display_name: `Игрок ${i + 1}`, role,
      exit_type: 'alive', regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0,
    })),
  },
});
// The server echoes the saved protocol as brand-new objects (JSON), like a real response.
const echo = (payload: any) => JSON.parse(JSON.stringify({ ...makeGame('draft'), club_protocol: { protocol: payload.protocol, player_results: payload.player_results } }));

describe('protocol editor autosave', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('saves one edit once and settles on «сохранено» instead of re-saving its own server echo', async () => {
    const save = vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => echo(payload));
    render(<EveningGameProtocolModal game={makeGame('draft')} isOpen onClose={() => {}} onUpdated={() => {}} />);
    const fouls = screen.getAllByText('+')[0];
    fireEvent.click(fouls);
    for (let i = 0; i < 6; i += 1) await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByText('сохранено')).toBeTruthy();
  });

  it('«Завершить игру» is not rolled back to a draft by a pending autosave', async () => {
    const calls: any[] = [];
    vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => { calls.push(payload.protocol.status); return echo(payload); });
    render(<EveningGameProtocolModal game={makeGame('draft', 'red')} isOpen onClose={() => {}} onUpdated={() => {}} />);
    fireEvent.click(screen.getAllByText('+')[0]);           // pending autosave (draft)
    fireEvent.click(screen.getByText('Итог'));
    fireEvent.click(screen.getByText('Завершить игру'));    // before the 1 s timer fires
    for (let i = 0; i < 6; i += 1) await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(calls[calls.length - 1]).toBe('completed');
    expect(calls.filter((s) => s === 'draft').length).toBeLessThanOrEqual(1);
  });

  it('says on screen what blocks «Завершить игру» instead of failing silently', async () => {
    const save = vi.spyOn(clubGamesApi, 'saveProtocol').mockImplementation(async (_id: number, payload: any) => echo(payload));
    render(<EveningGameProtocolModal game={makeGame('draft', null)} isOpen onClose={() => {}} onUpdated={() => {}} />);
    fireEvent.click(screen.getByText('Итог'));
    fireEvent.click(screen.getByText('Завершить игру'));
    expect(screen.getByRole('alert').textContent).toContain('победившую команду');
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(save).not.toHaveBeenCalled();
  });
});
