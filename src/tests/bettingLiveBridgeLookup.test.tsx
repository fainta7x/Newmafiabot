/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import BettingLiveBridge from '../components/BettingLiveBridge';

// 2026-10-26: during a live game the bridge read the whole games list every 750 ms to find the game of the ten players
// (up to 23 MB an answer on production). It now finds it once per game and retries an unresolved lookup every 30 s.
const names = Array.from({ length: 10 }, (_, i) => `Игрок ${i + 1}`);
const session = (phase: string) => JSON.stringify({ phase, activePlayers: names.map((nickname, i) => ({ slot_num: i + 1, nickname })) });
const game = (id: number) => ({ id, global_game_number: id, status: 'draft', club_protocol: { player_results: names.map((display_name) => ({ display_name })) } });

let games: any[] = [];
const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(String(url).startsWith('/api/games?') ? games : {}), { status: 200 }));
const lookups = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/games?')).length;
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); fetchMock.mockClear(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('live bridge: which game is being played', () => {
  it('reads the games list once per game, not every tick', async () => {
    games = [game(7)];
    localStorage.setItem('mafia_live_session', session('day_speeches'));
    render(<BettingLiveBridge />);
    await wait(60_000);
    expect(lookups()).toBe(1);
  });

  it('an unresolved game is looked up again every 30 s, and the next game is looked up afresh', async () => {
    games = [];
    localStorage.setItem('mafia_live_session', session('day_speeches'));
    render(<BettingLiveBridge />);
    await wait(61_000);
    expect(lookups()).toBe(3);
    games = [game(8)];
    await wait(30_000);
    expect(lookups()).toBe(4);
    await wait(30_000);
    expect(lookups()).toBe(4);
    // the game ends; the same ten players start the next one
    localStorage.setItem('mafia_live_session', session('setup'));
    await wait(1_000);
    games = [game(9)];
    localStorage.setItem('mafia_live_session', session('day_speeches'));
    await wait(1_000);
    expect(lookups()).toBe(5);
  });
});
