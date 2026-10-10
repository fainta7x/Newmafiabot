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
});
