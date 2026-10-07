/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerPoker from '../components/player/PlayerPoker.tsx';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const lobby = (canKick: boolean) => ({
  id: 'main', title: 'Общий стол', ownerId: 'me', status: 'waiting', permanent: true, money_mode: 'club_tokens', can_kick: canKick, viewer_player_id: 'me', hand: null,
  players: [{ id: 'me', nickname: 'Я', seat: 1, chips: 1000 }, { id: 'oleg', nickname: 'Олег', seat: 2, chips: 1000 }],
});
const entry = { id: 'main', title: 'Общий стол', status: 'waiting', permanent: true, money_mode: 'club_tokens', full: false, joined: false, players: [] };

let tableCalls = 0;
let kicked: unknown = null;
const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  tableCalls = 0; kicked = null;
  setVisibility('visible');
  vi.stubGlobal('confirm', () => true);
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/poker/lobbies') && !init?.method) return json({ lobbies: [entry] });
    if (url.endsWith('/join')) return json({ lobby: lobby(true) });
    if (url.endsWith('/kick')) { kicked = JSON.parse(String(init?.body)); return json({ lobby: { ...lobby(true), players: [lobby(true).players[0]] } }); }
    if (url.endsWith('/leave')) return json({ lobby: null });
    if (url.endsWith('/poker/lobbies/main')) { tableCalls += 1; return json({ lobby: lobby(true) }); }
    return json({});
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); setVisibility('visible'); });

const sitDown = async (onTokenBalanceChange?: (balance: number) => void) => {
  render(<PlayerPoker onTokenBalanceChange={onTokenBalanceChange} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  fireEvent.click(screen.getByRole('button', { name: /Войти|Сесть/ }));
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
};

describe('poker table screen', () => {
  it('puts a Telegram-invited live lobby first without auto-joining it', async () => {
    const invited = { ...entry, id: 'invite-table', title: 'Стол Фантома' };
    const other = { ...entry, id: 'other-table', title: 'Другой стол' };
    (fetch as any).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/poker/lobbies') && !init?.method) return json({ lobbies: [other, invited] });
      return json({});
    });
    render(<PlayerPoker initialLobbyId="invite-table" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(screen.getByText('вас позвали')).not.toBeNull();
    const headings = screen.getAllByText(/Стол Фантома|Другой стол/);
    expect(headings[0].textContent).toContain('Стол Фантома');
    expect((fetch as any).mock.calls.some((call: any[]) => String(call[0]).endsWith('/invite-table/join'))).toBe(false);
  });

  it('uses the selected 10 BB buy-in when joining a live table', async () => {
    render(<PlayerPoker />);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    fireEvent.click(screen.getByRole('button', { name: '10 ББ' }));
    fireEvent.click(screen.getByRole('button', { name: /Войти · 200/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    const join = (fetch as any).mock.calls.find((call: any[]) => String(call[0]).endsWith('/join'));
    expect(JSON.parse(String(join?.[1]?.body))).toEqual({ buy_in_tokens: 200 });
  });

  it('does not ask for the table while the screen is hidden, and asks again when it is shown', async () => {
    await sitDown();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(tableCalls).toBeGreaterThan(0);
    setVisibility('hidden');
    const before = tableCalls;
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(tableCalls).toBe(before);
    setVisibility('visible');
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(tableCalls).toBeGreaterThan(before);
  });

  it('gives the owner a button that takes another person off the table, and nobody else', async () => {
    await sitDown();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    const buttons = screen.getAllByTestId('poker-kick');
    expect(buttons).toHaveLength(1); // not on his own seat
    fireEvent.click(buttons[0]);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(kicked).toEqual({ playerId: 'oleg' });
  });

  it('never lets a slow, older answer replace a newer table or token balance', async () => {
    const balances: number[] = [];
    await sitDown((balance) => balances.push(balance));
    const older = { ...lobby(true) };
    const newer = { ...lobby(true), players: [...lobby(true).players, { id: 'vanya', nickname: 'Ваня', seat: 3, chips: 1000 }] };
    const late: Array<() => void> = [];
    let call = 0;
    (fetch as any).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.endsWith('/poker/lobbies/main')) return json({});
      call += 1;
      if (call === 1) return new Promise((resolve) => { late.push(() => resolve(new Response(JSON.stringify({ lobby: older, token_balance: 3500 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))); });
      return json({ lobby: newer, token_balance: 4000 });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.queryByText('Ваня')).not.toBeNull();
    expect(balances.at(-1)).toBe(4000);
    await act(async () => { late.forEach((release) => release()); await vi.advanceTimersByTimeAsync(10); });
    expect(screen.queryByText('Ваня')).not.toBeNull();
    expect(balances.at(-1)).toBe(4000);
    expect(balances).not.toContain(3500);
  });
});
