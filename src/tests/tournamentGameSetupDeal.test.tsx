// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const updateGameRoles = vi.fn(async (..._a: any[]) => ({}));
const startTournamentGame = vi.fn(async (..._a: any[]) => ({}));
vi.mock('../lib/api.ts', () => ({ api: { updateGameRoles: (...a: any[]) => updateGameRoles(...a), startTournamentGame: (...a: any[]) => startTournamentGame(...a) } }));
// The physical deal itself has its own tests; here only what the setup does with its result.
const ASSIGNMENTS: Record<number, string> = { 1: 'sheriff', 2: 'don', 3: 'mafia', 4: 'mafia', 5: 'citizen', 6: 'citizen', 7: 'citizen', 8: 'citizen', 9: 'citizen', 10: 'citizen' };
vi.mock('../components/game/PhysicalRoleDeal.tsx', () => ({ default: ({ onComplete }: any) => <button type="button" onClick={() => onComplete(ASSIGNMENTS)}>КАРТЫ-ГОТОВО</button> }));
import { TournamentGameSetup } from '../components/crm/tournaments/TournamentGameSetup';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const game = { id: 'g1', game_number: 3, status: 'planned', seats: Array.from({ length: 10 }, (_, i) => ({ id: `s${i + 1}`, seat_number: i + 1, display_name: `Игрок ${i + 1}`, role: null })) };
const props = (over: Record<string, unknown> = {}) => ({ tournamentId: 't1', game, tournamentStatus: 'active', isAnotherGameActive: false, activeGameNumber: undefined, judgeName: 'Чагин', chiefJudgeName: 'Чагин', canEditJudgeAndRoles: true, canSwapSeats: false, onOpenSwapModal: vi.fn(), onGameStarted: vi.fn(), setFeedbackMsg: vi.fn(), ...over } as any);

describe('tournament game setup: two ways to deal, one way to start (owner, 2026-11-09)', () => {
  it('offers virtual and physical cards and no manual role picker', () => {
    render(<TournamentGameSetup {...props()} />);
    expect(screen.getByRole('button', { name: /Раздать виртуальные карты/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Раздать физические карты/ })).toBeTruthy();
    expect(screen.queryByTestId('seat-button-1')).toBeNull();
    expect(screen.queryByTestId('save-and-start-game-btn')).toBeNull();
  });

  it('one reason on top disables both ways while another game is running', () => {
    render(<TournamentGameSetup {...props({ isAnotherGameActive: true, activeGameNumber: 2 })} />);
    expect(screen.getByTestId('role-deal-blocked').textContent).toContain('игру №2');
    expect((screen.getByTestId('tournament-setup-virtual-deal') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('tournament-setup-physical-deal') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a physical deal saves the roles and starts the game at once', async () => {
    const p = props();
    render(<TournamentGameSetup {...p} />);
    fireEvent.click(screen.getByTestId('tournament-setup-physical-deal'));
    fireEvent.click(screen.getByText('КАРТЫ-ГОТОВО'));
    await waitFor(() => expect(p.onGameStarted).toHaveBeenCalledWith('g1'));
    const roles = (updateGameRoles.mock.calls[0] as any)[2] as Array<{ seat_number: number; role: string }>;
    expect(roles.find((r) => r.seat_number === 1)?.role).toBe('sheriff');
    expect(roles.filter((r) => r.role === 'mafia')).toHaveLength(2);
    expect(startTournamentGame).toHaveBeenCalledWith('t1', 'g1');
  });

  it('a failed start keeps the dealt roles and retries without a new deal', async () => {
    startTournamentGame.mockRejectedValueOnce(new Error('Сервер недоступен'));
    const p = props();
    render(<TournamentGameSetup {...p} />);
    fireEvent.click(screen.getByTestId('tournament-setup-physical-deal'));
    fireEvent.click(screen.getByText('КАРТЫ-ГОТОВО'));
    expect(await screen.findByTestId('role-deal-unstarted')).toBeTruthy();
    expect(p.onGameStarted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Повторить запуск/ }));
    await waitFor(() => expect(p.onGameStarted).toHaveBeenCalledWith('g1'));
    expect(startTournamentGame).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('role-deal-unstarted')).toBeNull();
  });
});
