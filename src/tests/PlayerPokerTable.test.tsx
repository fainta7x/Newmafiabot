/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerPoker from '../components/player/PlayerPoker.tsx';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const lobby = (canKick: boolean) => ({
  id: 'main', title: 'Общий стол', ownerId: 'me', status: 'waiting', permanent: true, can_kick: canKick, viewer_player_id: 'me', hand: null,
  players: [{ id: 'me', nickname: 'Я', seat: 1, chips: 1000 }, { id: 'oleg', nickname: 'Олег', seat: 2, chips: 1000 }],
});
const entry = { id: 'main', title: 'Общий стол', status: 'waiting', permanent: true, full: false, joined: false, players: [] };

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

const sitDown = async () => {
  render(<PlayerPoker />);
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  fireEvent.click(screen.getByRole('button', { name: /Войти|Сесть/ }));
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
};

describe('poker table screen', () => {
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

  it('never lets a slow, older answer replace a newer one (the table must not flip back to an earlier state)', async () => {
    await sitDown();
    const older = { ...lobby(true) };
    const newer = { ...lobby(true), players: [...lobby(true).players, { id: 'vanya', nickname: 'Ваня', seat: 3, chips: 1000 }] };
    const late: Array<() => void> = [];
    let call = 0;
    (fetch as any).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.endsWith('/poker/lobbies/main')) return json({});
      call += 1;
      if (call === 1) return new Promise((resolve) => { late.push(() => resolve(new Response(JSON.stringify({ lobby: older }), { status: 200, headers: { 'Content-Type': 'application/json' } }))); });
      return json({ lobby: newer });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.queryByText('Ваня')).not.toBeNull();
    await act(async () => { late.forEach((release) => release()); await vi.advanceTimersByTimeAsync(10); });
    expect(screen.queryByText('Ваня')).not.toBeNull();
  });
});
