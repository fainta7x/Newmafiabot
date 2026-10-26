/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GameProtocolModal } from '../components/crm/tournaments/GameProtocolModal';
import { api } from '../lib/api';

// A busy CI machine renders the window slower than the default one second allows.
configure({ asyncUtilTimeout: 4000 });

const tournamentId = 'tourn';
const gameId = 'game';
const backupKey = `tournament_protocol_backup_${gameId}`;
const ROLES = ['citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'citizen', 'sheriff', 'mafia', 'mafia', 'don'];
const mockGame = { id: gameId, tournament_id: tournamentId, game_number: 1, table_number: 1, status: 'active', judge_name: 'Судья' };
const mockProtocol = {
  game_id: gameId, status: 'draft', winner_team: 'red', first_killed_participant_id: null, zero_round_voted_participant_id: null,
  best_move_participant_id: null, best_move_source: null, best_move_seats: [], votes: [], shots: [], replacement: null, judge_notes: null,
  best_move_score: 0, updated_at: '2026-01-01T00:00:00.000Z',
};
const results = (over: Record<number, Record<string, unknown>> = {}) => ROLES.map((role, i) => ({
  participant_id: `p-${i + 1}`, seat_number: i + 1, display_name: `Player ${i + 1}`, role, exit_type: 'alive', exit_order: null, removal_reason: null,
  regular_fouls: 0, minor_technical_fouls: 0, major_technical_fouls: 0, technical_fouls: 0, judge_bonus: 0, protocol_bonus: 0,
  penalty_points: 0, ci_points: 0, color_protocol: [], notes: null, ...(over[i + 1] || {}),
})) as any[];

const load = (protocol: Record<string, unknown> = {}, players = results()) =>
  vi.spyOn(api, 'getGameProtocol').mockResolvedValue({ game: mockGame as any, protocol: { ...mockProtocol, ...protocol } as any, player_results: players as any });
const open = (props: Record<string, unknown> = {}) => render(<GameProtocolModal tournamentId={tournamentId} gameId={gameId} isOpen={true} onClose={() => {}} {...props} />);
const place = (name: string) => fireEvent.click(screen.getAllByRole('button', { name })[0]);
const ready = async () => { await screen.findByText('Игра #1', {}, { timeout: 4000 }); };

beforeEach(() => { localStorage.clear(); vi.spyOn(api, 'getTournament').mockRejectedValue(new Error('offline')); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('tournament protocol in the common protocol window', () => {
  it('opens the same two places as a club game, plus the judge points', async () => {
    load();
    open();
    await ready();
    for (const name of ['Протокол', 'Ход игры', 'Баллы']) expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Судья: Судья/)).toBeTruthy();
  });

  it('ignores a newer localStorage backup instead of replaying it over canonical server data', async () => {
    load();
    const saveSpy = vi.spyOn(api, 'saveGameProtocol');
    localStorage.setItem(backupKey, JSON.stringify({ updatedAt: '2026-02-01T00:00:00.000Z', protocol: { ...mockProtocol, winner_team: 'black' }, playerResults: results() }));
    open();
    await ready();
    await waitFor(() => expect(JSON.parse(localStorage.getItem(backupKey) || '{}').protocol?.winner_team).toBe('red'));
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('the judge bonus stepper changes the points and autosaves once without closing the window or telling the tournament', async () => {
    load();
    const onProtocolUpdated = vi.fn();
    const saveSpy = vi.spyOn(api, 'saveGameProtocol').mockImplementation(async (_t, _g, payload: any) => ({ game: mockGame as any, protocol: { ...mockProtocol, updated_at: new Date().toISOString() } as any, player_results: payload.player_results }));
    open({ onProtocolUpdated });
    await ready();
    place('Баллы');
    const card = screen.getByTestId('judge-bonus-p-1');
    expect(card.querySelectorAll('input').length).toBe(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Увеличить балл судьи' })[0]);
    expect(saveSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect((saveSpy.mock.calls[0][2] as any).player_results[0].judge_bonus).toBe(0.1);
    expect(onProtocolUpdated).not.toHaveBeenCalled();
    expect(screen.getByTestId('judge-bonus-p-1')).toBeTruthy();
  });

  it('shows the protocol and judge bonuses with their sign', async () => {
    load({}, results({ 1: { protocol_bonus: -0.2 }, 2: { judge_bonus: 0.2 } }));
    open();
    await ready();
    place('Баллы');
    expect(screen.getByTestId('points-p-1').textContent).toContain('−0.2');
    expect(screen.getByTestId('points-p-2').textContent).toContain('+0.2');
    expect(document.body.textContent).not.toMatch(/\+-|−-/);
  });

  it('offers the old technical fouls to classify', async () => {
    load({}, results({ 1: { technical_fouls: 1 } }));
    open();
    await ready();
    place('Баллы');
    expect(((await screen.findByText(/1 малый/, {}, { timeout: 4000 })) as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not let a completed game classify its old technical fouls', async () => {
    load({ status: 'completed' }, results({ 1: { technical_fouls: 1 } }));
    open();
    await ready();
    place('Баллы');
    expect(((await screen.findByText(/1 малый/, {}, { timeout: 4000 })) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a PPK on a player without a role is refused with the dialog, and a removed player can still be given a PPK', async () => {
    load({ winner_team: null }, results({ 1: { role: null } }));
    open();
    await ready();
    place('Протокол');
    fireEvent.click(screen.getAllByRole('button', { name: /Игрок 1 Player 1, открыть/ })[0]);
    fireEvent.click((await screen.findAllByText('ППК')).find((node) => node.tagName === 'BUTTON')!);
    expect(await screen.findByText(/Сначала назначьте роль участнику/i)).toBeTruthy();
    expect((screen.getByText('Подтвердить') as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    load({}, results({ 1: { exit_type: 'removed', removal_reason: 'direct', role: 'citizen' } }));
    open();
    await ready();
    place('Протокол');
    fireEvent.click(screen.getAllByRole('button', { name: /Игрок 1 Player 1, открыть/ })[0]);
    const ppk = (await screen.findAllByText('ППК')).find((node) => node.tagName === 'BUTTON') as HTMLButtonElement;
    expect(ppk.disabled).toBe(false);
    fireEvent.click(ppk);
    expect(await screen.findByText(/Победитель: Чёрные/i)).toBeTruthy();
  });

  it('confirming the game asks first and tells the tournament exactly once', async () => {
    load();
    const onProtocolUpdated = vi.fn();
    vi.spyOn(api, 'completeGameProtocol').mockResolvedValue({ game: { ...mockGame, status: 'completed' } as any, protocol: { ...mockProtocol, status: 'completed' } as any, player_results: results() as any });
    open({ onProtocolUpdated });
    await ready();
    fireEvent.click(screen.getAllByRole('button', { name: /Подтвердить игру/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Подтвердить завершение/i }));
    await waitFor(() => expect(onProtocolUpdated).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: /Исправить протокол/ })).toBeTruthy();
  });

  it('reopening a finished game asks first and tells the tournament exactly once', async () => {
    load({ status: 'completed' });
    const onProtocolUpdated = vi.fn();
    vi.spyOn(api, 'revertGameProtocolToDraft').mockResolvedValue({ game: { ...mockGame, status: 'active' } as any, protocol: { ...mockProtocol, status: 'draft' } as any, player_results: results() as any });
    open({ onProtocolUpdated });
    await ready();
    fireEvent.click(screen.getAllByRole('button', { name: /Исправить протокол/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Да, открыть для правки/i }));
    await waitFor(() => expect(onProtocolUpdated).toHaveBeenCalledTimes(1));
  });

  it('a game missing the winner is not confirmed and says so on screen', async () => {
    load({ winner_team: null });
    open();
    await ready();
    fireEvent.click(screen.getAllByRole('button', { name: /Подтвердить игру/ })[0]);
    expect(await screen.findByText(/Укажите победившую команду/)).toBeTruthy();
  });
});
