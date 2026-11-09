// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const updateGameRoles = vi.fn(async () => ({}));
const startTournamentGame = vi.fn(async () => ({}));
vi.mock('../lib/api.ts', () => ({ api: { updateGameRoles: (...a: any[]) => (updateGameRoles as any)(...a), startTournamentGame: (...a: any[]) => (startTournamentGame as any)(...a) } }));
// The deal is kept on the server (owner, 2026-11-09): a small in-memory stand-in for its five calls.
vi.mock('../lib/clubGamesApi.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/clubGamesApi.ts')>();
  const fresh = (version: number) => {
    const roles = ['sheriff', 'don', 'mafia', 'mafia', ...Array(6).fill('citizen')];
    return { version, deck: roles.map((role, i) => ({ id: `c${i}`, role })), history: [] as any[], pending: null as any };
  };
  const view = (st: any) => ({ version: st.version, cards: st.deck.map((c: any) => ({ id: c.id })), history: st.history.map((h: any) => ({ seat: h.seat, cardId: h.cardId, role: h.role })), pending: null });
  return {
    ...original,
    tournamentRoleDealApi: (_t: string, gameId: string) => {
      let st = fresh(0);
      return {
        key: `tournament:${gameId}`,
        open: async () => { st = fresh(st.version + 1); return view(st); },
        reveal: async ({ cardId, seat }: any) => { const card = st.deck.find((c: any) => c.id === cardId)!; st.pending = { seat, cardId, role: card.role }; st.version += 1; return { version: st.version, role: card.role }; },
        confirm: async () => { st.history.push({ ...st.pending }); st.deck = st.deck.filter((c: any) => c.id !== st.pending.cardId); st.pending = null; st.version += 1; return view(st); },
        buy: async () => { throw new Error('no purchase'); },
        undo: async () => view(st),
        reset: async () => { st = fresh(st.version + 1); return view(st); },
      };
    },
  };
});
import { TournamentGameSetup } from '../components/crm/tournaments/TournamentGameSetup';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const game = { id: 'g1', game_number: 3, status: 'planned', seats: Array.from({ length: 10 }, (_, i) => ({ seat_number: i + 1, display_name: `Игрок ${i + 1}`, role: null })) };
const props = (status: string) => ({ tournamentId: 't1', game, tournamentStatus: status, isAnotherGameActive: false, activeGameNumber: null, judgeName: 'Чагин', chiefJudgeName: 'Чагин', canEditJudgeAndRoles: true, canSwapSeats: false, onOpenSwapModal: vi.fn(), onEditJudgeClick: vi.fn(), onGameStarted: vi.fn(), setFeedbackMsg: vi.fn() }) as any;

describe('tournament game start with the virtual deal (owner, 2026-11-07)', () => {
  it('is offered only in a started tournament', () => {
    render(<TournamentGameSetup {...props('draft')} />);
    expect((screen.getByTestId('tournament-setup-virtual-deal') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Сначала нажмите «Запустить турнир»/)).toBeDefined();
  });

  it('the last card saves the roles and starts the game', async () => {
    sessionStorage.setItem('role_deal_card_seconds', '0');
    const p = props('active');
    render(<TournamentGameSetup {...p} />);
    fireEvent.click(screen.getByTestId('tournament-setup-virtual-deal'));
    // the deal is opened on the server first: its buttons wake up when the cards have arrived
    await waitFor(() => expect((screen.getByRole('button', { name: 'Начать раздачу' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Начать раздачу' }));
    fireEvent.click(await screen.findByTestId('virtual-deal-go'));
    for (let i = 0; i < 10; i += 1) {
      fireEvent.click((await screen.findAllByRole('button', { name: /^Карта №/ }))[0]);
      await waitFor(() => expect((screen.getByTestId('virtual-deal-next-player') as HTMLButtonElement).disabled).toBe(false), { timeout: 15000 });
      fireEvent.click(screen.getByTestId('virtual-deal-next-player'));
    }
    await waitFor(() => expect(startTournamentGame).toHaveBeenCalledWith('t1', 'g1'), { timeout: 10000 });
    const roles = (updateGameRoles.mock.calls[0] as any)[2] as Array<{ role: string }>;
    expect(roles.filter((r) => r.role === 'mafia')).toHaveLength(2);
    expect(roles.filter((r) => r.role === 'don')).toHaveLength(1);
    expect(roles.filter((r) => r.role === 'sheriff')).toHaveLength(1);
    expect(p.onGameStarted).toHaveBeenCalledWith('g1');
  }, 200000);
});
