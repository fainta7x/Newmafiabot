// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PokerTournaments from '../components/player/PokerTournaments.tsx';

const settings = { startAt: '2026-10-20T18:00:00Z', minPlayers: 4, maxPlayers: null, startingStack: 1000, levelMinutes: 6, rebuyUntilLevel: 4, rebuyCostTokens: 500, rebuyChips: 1000, seatsPerTable: 6, prizeTokens: [3000, 1500] };
const tournament = (extra: Record<string, unknown> = {}) => ({
  id: 'ptr_1', title: 'Турбо вечера', description: '', status: 'registration', cancel_reason: null, start_at: '2026-10-20T18:00:00Z',
  settings, players: 3, spots_left: null, clock: null, rebuy_open: false, my_entry: null, ...extra,
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mockFetch = (items: unknown[], canOrganize = false) => {
  const calls: Array<{ url: string; method: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method || 'GET' });
    return { ok: true, json: async () => ({ tournaments: items, can_organize: canOrganize }) } as Response;
  }));
  return calls;
};

describe('PokerTournaments', () => {
  it('shows nothing when there are no tournaments and the viewer cannot organize one', async () => {
    mockFetch([]);
    const { container } = render(<PokerTournaments />);
    await waitFor(() => expect(container.querySelector('[data-testid="poker-tournaments"]')).toBeNull());
  });

  it('lists a tournament with its settings and registers for free', async () => {
    const calls = mockFetch([tournament()]);
    render(<PokerTournaments />);
    await screen.findByText('Турбо вечера');
    expect(screen.getByText(/3 игрока, нужно не меньше 4/)).toBeTruthy();
    expect(screen.getByText(/докупка до уровня 4 за 500 жетонов/)).toBeTruthy();
    expect(screen.getByText(/1 место — 3\s?000 · 2 место — 1\s?500/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Записаться бесплатно' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/ptr_1/register'))).toBe(true));
  });

  it('shows a running tournament with the field left, and takes a seated player to his table', async () => {
    mockFetch([tournament({ status: 'running', alive: 7, waiting_rebuy: 1, my_table_id: 'ptt_ptr_1_2', standings: [], my_entry: { status: 'playing', rebuys: 0, place: null } })]);
    const open = vi.fn();
    render(<PokerTournaments onOpenTable={open} />);
    await screen.findByText(/В игре 7, ждут докупки: 1/);
    fireEvent.click(screen.getByRole('button', { name: 'К моему столу' }));
    expect(open).toHaveBeenCalledWith('ptt_ptr_1_2');
  });

  it('offers a busted player the re-buy while it is open, with its price, and says when it is closed', async () => {
    const calls = mockFetch([
      tournament({ id: 'a', status: 'running', rebuy_open: true, alive: 5, my_entry: { status: 'playing', rebuys: 0, place: null, busted: true } }),
      tournament({ id: 'b', title: 'Другой', status: 'running', rebuy_open: false, alive: 5, my_entry: { status: 'playing', rebuys: 0, place: null, busted: true } }),
    ]);
    render(<PokerTournaments />);
    const button = await screen.findByRole('button', { name: /докупить за 500 жетонов/i });
    expect(screen.getByText(/докупка закрыта/i)).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/a/rebuy'))).toBe(true));
  });

  it('passes the new wallet balance up after a re-buy from the card', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => (init?.method === 'POST' ? { tournament: {}, token_balance: 900 } : { tournaments: [tournament({ status: 'running', rebuy_open: true, alive: 4, my_entry: { status: 'playing', rebuys: 0, place: null, busted: true } })], can_organize: false }),
    } as Response)));
    const onBalance = vi.fn();
    render(<PokerTournaments onTokenBalanceChange={onBalance} />);
    fireEvent.click(await screen.findByRole('button', { name: /докупить за 500 жетонов/i }));
    await waitFor(() => expect(onBalance).toHaveBeenCalledWith(900));
  });

  it('tells a player who is out his place, and lists the places of a finished tournament', async () => {
    mockFetch([
      tournament({ id: 'a', status: 'running', alive: 3, my_entry: { status: 'eliminated', rebuys: 0, place: 5 } }),
      tournament({ id: 'b', title: 'Старый', status: 'finished', standings: [{ nickname: 'Победитель', place: 1 }, { nickname: 'Второй', place: 2 }] }),
    ]);
    render(<PokerTournaments />);
    await screen.findByText('Я выбыл: 5 место');
    expect(screen.getByText('Победитель')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'К моему столу' })).toBeNull();
  });

  it('shows a registered player the way out, and the organizer the create form', async () => {
    mockFetch([tournament({ my_entry: { status: 'registered', rebuys: 0, place: null } })], true);
    render(<PokerTournaments />);
    await screen.findByText('Запись есть');
    expect(screen.getByRole('button', { name: 'Отписаться' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ Турнир' }));
    expect(screen.getByTestId('poker-tournament-form')).toBeTruthy();
  });
  const schedule = [
    { level: 1, small: 10, big: 20, startMinute: 0, startsAt: '2026-10-20T18:00:00.000Z', startingStackBb: 50, lateRegOpen: true, rebuyOpen: true },
    { level: 2, small: 15, big: 30, startMinute: 6, startsAt: '2026-10-20T18:06:00.000Z', startingStackBb: 33.3, lateRegOpen: true, rebuyOpen: false },
    { level: 3, small: 20, big: 40, startMinute: 12, startsAt: '2026-10-20T18:12:00.000Z', startingStackBb: 25, lateRegOpen: false, rebuyOpen: false },
  ];

  it('shows the table of levels with the time of each one and what is still possible', async () => {
    mockFetch([tournament({ schedule, settings: { ...settings, lateRegUntilLevel: 2 } })]);
    render(<PokerTournaments />);
    await screen.findByText('Турбо вечера');
    const table = screen.getByTestId('poker-tournament-schedule');
    expect(table.textContent).toContain('10/20');
    expect(table.textContent).toContain('21:06');           // 18:06 UTC is 21:06 in Moscow
    expect(table.textContent).toContain('33,3');
    expect(table.textContent).toMatch(/Поздняя запись закрывается после 2-го уровня \(в 21:12\)/);
    expect(table.textContent).toMatch(/Докупка закрывается после 1-го уровня \(в 21:06\)/);
    expect(table.textContent).not.toMatch(/\b(ты|вы)\b/i);
    expect(screen.getByText(/поздняя запись до уровня 2/)).toBeTruthy();
  });

  it('offers a newcomer to enter a running tournament while late registration is open, and not a player who is already in', async () => {
    const running = (extra: Record<string, unknown>) => tournament({ status: 'running', clock: { level: 2, small: 15, big: 30, secondsToNextLevel: 100 }, alive: 4, waiting_rebuy: 0, schedule, settings: { ...settings, lateRegUntilLevel: 2 }, ...extra });
    const calls = mockFetch([running({ late_reg_open: true })]);
    render(<PokerTournaments />);
    const button = await screen.findByTestId('poker-tournament-late-reg');
    expect(button.textContent).toContain('до конца 2-го уровня');
    fireEvent.click(button);
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/ptr_1/register'))).toBe(true));
    cleanup();
    mockFetch([running({ late_reg_open: true, my_entry: { status: 'playing', rebuys: 0, place: null } })]);
    render(<PokerTournaments />);
    await screen.findByText('Турбо вечера');
    expect(screen.queryByTestId('poker-tournament-late-reg')).toBeNull();
    cleanup();
    mockFetch([running({ late_reg_open: false })]);
    render(<PokerTournaments />);
    await screen.findByText('Турбо вечера');
    expect(screen.queryByTestId('poker-tournament-late-reg')).toBeNull();
  });
});
