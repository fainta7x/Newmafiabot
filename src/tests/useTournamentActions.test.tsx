/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { api } from '../lib/api';
import { useTournamentActions } from '../components/crm/tournaments/useTournamentActions';

const seat = (n: number, role: string | null = null) => ({ seat_number: n, role, participant_id: `p${n}`, display_name: `P${n}` });
const makeTournament = (status: string, gameStatus = 'planned') => ({
  id: 't1', status,
  games: [
    { id: 'g1', game_number: 1, status: gameStatus, seats: Array.from({ length: 10 }, (_, i) => seat(i + 1)) },
    { id: 'g2', game_number: 2, status: 'planned', seats: [] },
  ],
}) as any;

const setup = (tournament: any) => {
  const loadDetail = vi.fn().mockResolvedValue(undefined);
  const setTournament = vi.fn();
  const goToGames = vi.fn();
  const hook = renderHook(() => useTournamentActions({ tournamentId: 't1', tournament, selectedGameIdx: 0, loadDetail, setTournament, goToGames }));
  return { hook, loadDetail, setTournament, goToGames };
};

beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe('tournament card actions', () => {
  it('«Исправить» on a game of a completed tournament reopens the tournament first and remembers the game', async () => {
    const revert = vi.spyOn(api, 'revertGameProtocolToDraft').mockResolvedValue({} as any);
    const { hook } = setup(makeTournament('completed', 'completed'));
    await act(async () => { await hook.result.current.handleCorrectGame('g1'); });
    expect(hook.result.current.showReopenModal).toBe(true);
    expect(revert).not.toHaveBeenCalled();
  });

  it('«Исправить» on a game of a tournament under correction opens the game and reloads', async () => {
    const revert = vi.spyOn(api, 'revertGameProtocolToDraft').mockResolvedValue({} as any);
    const { hook, loadDetail } = setup(makeTournament('correction', 'completed'));
    await act(async () => { await hook.result.current.handleCorrectGame('g1'); });
    expect(revert).toHaveBeenCalledWith('t1', 'g1');
    expect(hook.result.current.feedbackMsg?.type).toBe('success');
    expect(loadDetail).toHaveBeenCalled();
    expect(hook.result.current.actionLoading).toBe(false);
  });

  it('a failed game step after the tournament was reopened says so and still reloads', async () => {
    vi.spyOn(api, 'reopenTournamentForCorrection').mockResolvedValue({} as any);
    vi.spyOn(api, 'revertGameProtocolToDraft').mockRejectedValue(new Error('нет связи'));
    const { hook, loadDetail } = setup(makeTournament('completed', 'completed'));
    await act(async () => { await hook.result.current.handleCorrectGame('g1'); });
    await act(async () => { await hook.result.current.handleReopenTournament(); });
    expect(hook.result.current.feedbackMsg).toEqual({ type: 'error', text: expect.stringContaining('игру открыть не удалось: нет связи') });
    expect(loadDetail).toHaveBeenCalled();
  });

  it('reopening the tournament without a pending game only reopens the tournament', async () => {
    const reopen = vi.spyOn(api, 'reopenTournamentForCorrection').mockResolvedValue({} as any);
    const revert = vi.spyOn(api, 'revertGameProtocolToDraft');
    const { hook } = setup(makeTournament('completed', 'completed'));
    await act(async () => { await hook.result.current.handleReopenTournament(); });
    expect(reopen).toHaveBeenCalledWith('t1');
    expect(revert).not.toHaveBeenCalled();
    expect(hook.result.current.feedbackMsg?.text).toContain('Турнир возвращён на корректировку');
  });

  it('a failed reopening tells the organizer and rethrows so the dialog stays open', async () => {
    vi.spyOn(api, 'reopenTournamentForCorrection').mockRejectedValue(new Error('отказ'));
    const { hook } = setup(makeTournament('completed', 'completed'));
    await act(async () => { await expect(hook.result.current.handleReopenTournament()).rejects.toThrow('отказ'); });
    expect(hook.result.current.feedbackMsg).toEqual({ type: 'error', text: 'отказ' });
  });

  it('cancelling asks first; a «no» changes nothing, a «yes» says how many players were told', async () => {
    const cancel = vi.spyOn(api, 'cancelTournament').mockResolvedValue({ notified: 4 } as any);
    const { hook, loadDetail } = setup(makeTournament('active'));
    (window.confirm as any).mockReturnValueOnce(false);
    await act(async () => { await hook.result.current.handleCancelTournament(); });
    expect(cancel).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.handleCancelTournament(); });
    expect(cancel).toHaveBeenCalledWith('t1');
    expect(hook.result.current.feedbackMsg?.text).toBe('Турнир отменён. Игроков уведомлено: 4');
    expect(loadDetail).toHaveBeenCalled();
  });

  it('starting the tournament closes the dialog and moves to the games; a failure stays in the dialog', async () => {
    const start = vi.spyOn(api, 'startTournament').mockRejectedValueOnce(new Error('рано')).mockResolvedValueOnce({} as any);
    const { hook, goToGames } = setup(makeTournament('draft'));
    act(() => hook.result.current.handleOpenStartModal());
    expect(hook.result.current.showStartModal).toBe(true);
    await act(async () => { await hook.result.current.handleConfirmStartTournament(); });
    expect(hook.result.current.startModalError).toBe('рано');
    expect(goToGames).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.handleConfirmStartTournament(); });
    expect(start).toHaveBeenCalledTimes(2);
    expect(hook.result.current.showStartModal).toBe(false);
    expect(goToGames).toHaveBeenCalled();
    expect(hook.result.current.startModalLoading).toBe(false);
  });

  it('putting a game back to the plan drops only that game\'s leftovers from the browser', async () => {
    vi.spyOn(api, 'resetTournamentGameToPlanned').mockResolvedValue({} as any);
    localStorage.setItem('mafia_live_session', 'x');
    localStorage.setItem('mafia_live_session:tournament:g1:protocol', 'x');
    localStorage.setItem('mafia_live_broadcast_votes:tournament:t1:g1', 'x');
    localStorage.setItem('mafia_live_session:tournament:g2:protocol', 'keep');
    const { hook } = setup(makeTournament('active', 'active'));
    await act(async () => { await hook.result.current.handleResetGameToPlanned(); });
    expect(localStorage.getItem('mafia_live_session')).toBeNull();
    expect(localStorage.getItem('mafia_live_session:tournament:g1:protocol')).toBeNull();
    expect(localStorage.getItem('mafia_live_broadcast_votes:tournament:t1:g1')).toBeNull();
    expect(localStorage.getItem('mafia_live_session:tournament:g2:protocol')).toBe('keep');
    expect(hook.result.current.feedbackMsg?.text).toBe('Игра №1 снова запланирована');
  });

  it('dropping the last game sets the count to one less', async () => {
    const setCount = vi.spyOn(api, 'setTournamentGameCount').mockResolvedValue({} as any);
    const { hook } = setup(makeTournament('active'));
    await act(async () => { await hook.result.current.handleDropLastGame(); });
    expect(setCount).toHaveBeenCalledWith('t1', 1);
    expect(hook.result.current.feedbackMsg?.text).toBe('Теперь в турнире 1 игр');
  });

  it('swapping the same seat with itself is refused without a call', async () => {
    const swap = vi.spyOn(api, 'swapTournamentSeats').mockResolvedValue({} as any);
    const { hook } = setup(makeTournament('active'));
    act(() => { hook.result.current.setSwapSeat1(3); hook.result.current.setSwapSeat2(3); });
    await act(async () => { await hook.result.current.handleSwapSeats(); });
    expect(swap).not.toHaveBeenCalled();
    expect(hook.result.current.feedbackMsg).toEqual({ type: 'error', text: 'Выберите два разных места для перестановки' });
  });

  it('swapping two seats calls the API, closes the dialog and reloads', async () => {
    const swap = vi.spyOn(api, 'swapTournamentSeats').mockResolvedValue({} as any);
    const { hook, loadDetail } = setup(makeTournament('active'));
    act(() => { hook.result.current.setShowSwapModal(true); hook.result.current.setSwapSeat1(1); hook.result.current.setSwapSeat2(2); });
    await act(async () => { await hook.result.current.handleSwapSeats(); });
    expect(swap).toHaveBeenCalledWith('t1', 'g1', 1, 2);
    expect(hook.result.current.showSwapModal).toBe(false);
    expect(loadDetail).toHaveBeenCalled();
  });

  it('assigning a role writes every seat and updates the card without a reload', async () => {
    const update = vi.spyOn(api, 'updateGameRoles').mockResolvedValue({} as any);
    const { hook, setTournament, loadDetail } = setup(makeTournament('active'));
    await act(async () => { await hook.result.current.handleAssignRole(4, 'don'); });
    expect(update).toHaveBeenCalledTimes(1);
    const sent = update.mock.calls[0][2] as Array<{ seat_number: number; role: string | null }>;
    expect(sent).toHaveLength(10);
    expect(sent.find((item) => item.seat_number === 4)?.role).toBe('don');
    expect(setTournament.mock.calls[0][0].games[0].seats[3].role).toBe('don');
    expect(loadDetail).not.toHaveBeenCalled();
  });

  it('a role over the limit is refused with the reason and no call', async () => {
    const update = vi.spyOn(api, 'updateGameRoles').mockResolvedValue({} as any);
    const tournament = makeTournament('active');
    tournament.games[0].seats = tournament.games[0].seats.map((s: any, i: number) => (i < 1 ? { ...s, role: 'don' } : s));
    const { hook } = setup(tournament);
    await act(async () => { await hook.result.current.handleAssignRole(5, 'don'); });
    expect(update).not.toHaveBeenCalled();
    expect(hook.result.current.feedbackMsg?.type).toBe('error');
  });

  it('saving the judge trims the name, closes the editor and reloads', async () => {
    const judge = vi.spyOn(api, 'updateGameJudge').mockResolvedValue({} as any);
    const { hook, loadDetail } = setup(makeTournament('active'));
    act(() => { hook.result.current.setEditingJudge(true); hook.result.current.setJudgeInput('  Судья  '); });
    await act(async () => { await hook.result.current.handleSaveJudge(); });
    expect(judge).toHaveBeenCalledWith('t1', 'g1', 'Судья');
    expect(hook.result.current.editingJudge).toBe(false);
    expect(loadDetail).toHaveBeenCalled();
  });
});
