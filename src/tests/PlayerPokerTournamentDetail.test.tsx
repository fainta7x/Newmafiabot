// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerPokerTournamentDetail from '../components/player/PlayerPokerTournamentDetail.tsx';

const settings = { minPlayers: 4, maxPlayers: null, startingStack: 1000, levelMinutes: 6, seatsPerTable: 6, rebuyUntilLevel: 6, rebuyCostTokens: 1000, rebuyChips: 1000, prizeTokens: [], lateRegUntilLevel: 6 };
const schedule = [
  { level: 1, small: 10, big: 20, startMinute: 0, startsAt: '2026-10-20T18:00:00.000Z', startingStackBb: 50, lateRegOpen: true, rebuyOpen: true },
  { level: 2, small: 15, big: 30, startMinute: 6, startsAt: '2026-10-20T18:06:00.000Z', startingStackBb: 33.3, lateRegOpen: true, rebuyOpen: true },
];
const detail = (extra: Record<string, unknown> = {}) => ({
  id: 'ptr_1', title: 'Вечерний турбо', description: 'Турнир для своих', status: 'registration', cancel_reason: null, start_at: '2026-10-20T18:00:00Z',
  players: 2, spots_left: null, alive: null, my_table_id: null, settings, schedule, late_reg_open: false, clock: null, my_entry: null, standings: [],
  participants: [
    { id: 'a', nickname: 'Алиса', status: 'registered', place: null, rebuys: 0, out: false },
    { id: 'b', nickname: 'Боб', status: 'registered', place: null, rebuys: 0, out: false },
  ], ...extra,
});

beforeEach(() => { window.scrollTo = (() => undefined) as typeof window.scrollTo; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const open = (tournament: unknown) => {
  const calls: Array<{ url: string; method: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method || 'GET' });
    return { ok: true, json: async () => ({ tournament }) } as Response;
  }));
  render(<PlayerPokerTournamentDetail tournamentId="ptr_1" onBack={() => undefined} onSaved={() => undefined} />);
  return calls;
};

describe('the page of a poker tournament in the events calendar', () => {
  it('shows who has signed up, how many are still needed, the table of levels and the late registration', async () => {
    open(detail());
    await screen.findByText('Вечерний турбо');
    const card = screen.getByTestId('poker-tournament-participants-card');
    expect(card.textContent).toContain('Кто записался · 2');
    expect(card.textContent).toContain('Алиса');
    expect(card.textContent).toContain('Боб');
    expect(card.textContent).toContain('нужно ещё 2');
    expect(screen.getByTestId('poker-tournament-schedule').textContent).toContain('15/30');
    expect(screen.getByText(/в идущий турнир, до конца 6-го уровня/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Записаться бесплатно' })).toBeTruthy();
  });

  it('says so when nobody has signed up yet', async () => {
    open(detail({ players: 0, participants: [] }));
    await screen.findByText('Вечерний турбо');
    expect(screen.getByTestId('poker-tournament-participants-empty').textContent).toBe('Пока никто не записался');
  });

  it('offers a newcomer to enter the running tournament', async () => {
    const calls = open(detail({ status: 'running', late_reg_open: true, alive: 2, clock: { level: 2 } }));
    const button = await screen.findByTestId('poker-tournament-late-reg');
    expect(button.textContent).toContain('до конца 6-го уровня');
    expect(screen.getByText('Участники · 2')).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/ptr_1/register'))).toBe(true));
  });
});
