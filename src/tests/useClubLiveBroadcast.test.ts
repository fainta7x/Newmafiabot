/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { appendReplayFrame, readAliveSeats, useClubLiveBroadcast, useLiveAliveSeats } from '../components/crm/useClubLiveBroadcast';
import { clubGamesApi } from '../lib/clubGamesApi';
import { MAX_REPLAY_FRAMES } from '../lib/liveBroadcast';
import { replayFramesKey } from '../lib/liveStorageBudget';

// The OBS publication and the replay recording of a club live game, moved out of EveningLiveGameModal (2026-10-26).

const session = (phase = 'day_speeches', timeLeft = 51) => ({
  phase, roundNumber: 2, activeSpeakerSlot: 1, timeLeft, timerMax: 60, isTimerRunning: true,
  activePlayers: Array.from({ length: 10 }, (_, i) => ({
    slot_num: i + 1, nickname: `Игрок ${i + 1}`, role: i === 9 ? 'Дон' : i >= 7 ? 'Мафия' : i === 6 ? 'Шериф' : 'Мирный',
    team: i >= 7 ? 'Чёрные' : 'Красные', alive: i !== 4, fouls: 0, exit_reason: i === 4 ? 'killed' : 'alive',
  })),
  nominations: [], nominationsMap: {}, votingRounds: [], activeVotingRoundIndex: 0, votesByPlayer: {}, votes: {},
  votingStage: 'setup', nightSubPhase: 'intro', postNightStage: 'none', protocolMarkers: {}, discipline: { players: {} }, nightLogs: [],
});
const game = { id: 77, global_game_number: 5, table_name: 'Стол 1', club_protocol: { protocol: {}, player_results: Array.from({ length: 10 }, (_, i) => ({ seat_number: i + 1, player_id: `p${i + 1}`, display_name: `Игрок ${i + 1}` })) } } as any;

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

describe('replay frames and alive seats', () => {
  it('keeps a frame when the picture changes or every 10 s, never more than the limit', () => {
    const t0 = Date.parse('2026-10-26T12:00:00Z');
    const first = appendReplayFrame([], { phase: 'day', timerSeconds: 50 }, t0)!;
    expect(first).toHaveLength(1);
    // only the timer moved: nothing new within 10 s, a frame after 10 s
    expect(appendReplayFrame(first, { phase: 'day', timerSeconds: 40 }, t0 + 5_000)).toBeNull();
    expect(appendReplayFrame(first, { phase: 'day', timerSeconds: 40 }, t0 + 10_000)).toHaveLength(2);
    expect(appendReplayFrame(first, { phase: 'night', timerSeconds: 50 }, t0 + 1_000)).toHaveLength(2);
    const full = Array.from({ length: MAX_REPLAY_FRAMES }, (_, i) => ({ at: new Date(t0 + i).toISOString(), state: { n: i } })) as any;
    const capped = appendReplayFrame(full, { n: 'new' }, t0 + MAX_REPLAY_FRAMES)!;
    expect(capped).toHaveLength(MAX_REPLAY_FRAMES);
    expect((capped.at(-1)!.state as any).n).toBe('new');
  });

  it('reads alive seats 1–10 from the stored session and ignores anything unreadable', () => {
    expect(readAliveSeats(JSON.stringify(session()))).toMatchObject({ 1: true, 5: false, 10: true });
    expect(readAliveSeats(JSON.stringify({ activePlayers: [{ slot_num: 11 }, { slot_num: 'x' }] }))).toEqual({});
    expect(readAliveSeats('{oops')).toEqual({});
    expect(readAliveSeats(null)).toEqual({});
  });

  it('polls the alive seats only while the game runs', () => {
    localStorage.setItem('mafia_live_session', JSON.stringify(session()));
    const { result, rerender } = renderHook(({ phase }) => useLiveAliveSeats(phase), { initialProps: { phase: 'setup' } });
    expect(result.current).toEqual({});
    rerender({ phase: 'day_speeches' });
    expect(result.current[5]).toBe(false);
    rerender({ phase: 'setup' });
    expect(result.current).toEqual({});
  });
});

describe('OBS publication of a club live game', () => {
  it('publishes the overlay, records the replay on the device and forgets it after the save', async () => {
    const publish = vi.spyOn(clubGamesApi, 'publishBroadcastState').mockResolvedValue(undefined as any);
    localStorage.setItem('mafia_live_session', JSON.stringify(session()));
    const { result, rerender } = renderHook(({ phase }) => useClubLiveBroadcast(game, phase), { initialProps: { phase: 'setup' } });
    expect(result.current.connection).toBe('idle');
    expect(publish).not.toHaveBeenCalled();
    rerender({ phase: 'day_speeches' });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toBe(77);
    expect(result.current.connection).toBe('live');
    expect(JSON.parse(localStorage.getItem(replayFramesKey(77))!)).toHaveLength(1);
    // the same picture is not sent again within 5 s, then it is
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(publish).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });
    expect(publish).toHaveBeenCalledTimes(2);
    act(() => result.current.forgetReplayFrames());
    expect(localStorage.getItem(replayFramesKey(77))).toBeNull();
  });

  it('a failed publication shows «offline» and waits 2 s before the next try', async () => {
    const publish = vi.spyOn(clubGamesApi, 'publishBroadcastState').mockRejectedValue(new Error('сеть'));
    localStorage.setItem('mafia_live_session', JSON.stringify(session()));
    const { result } = renderHook(() => useClubLiveBroadcast(game, 'day_speeches'));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(result.current.connection).toBe('offline');
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(publish).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('nothing is sent without a stored session', async () => {
    const publish = vi.spyOn(clubGamesApi, 'publishBroadcastState').mockResolvedValue(undefined as any);
    renderHook(() => useClubLiveBroadcast(game, 'day_speeches'));
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(publish).not.toHaveBeenCalled();
  });
});
