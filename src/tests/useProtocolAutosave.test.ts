/**
 * @vitest-environment jsdom
 */
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useProtocolAutosave } from '../components/crm/gameProtocol/useProtocolAutosave';

// One autosave for the club and the tournament protocol window (architecture programme, 2026-10-26).
const base = { game_id: '1', status: 'draft', winner_team: null, judge_notes: null } as any;
const results = [{ participant_id: 'p1', seat_number: 1 }] as any[];

const setup = (send: (protocol: any, results: any[]) => Promise<any>, extra: Record<string, unknown> = {}) => renderHook(() => {
  const [protocol, setProtocol] = useState<any>(base);
  const [playerResults, setPlayerResults] = useState<any[]>(results);
  const autosave = useProtocolAutosave<any>({
    active: true, protocol, playerResults, setProtocol, setPlayerResults, send,
    echoOf: (answer) => answer, delayMs: 1000, ...extra,
  });
  return { protocol, setProtocol, autosave };
});
const echo = async (protocol: any, playerResults: any[]) => ({ protocol: { ...protocol, updated_at: String(Date.now()) }, player_results: playerResults });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('protocol autosave', () => {
  it('sends an edit once after the delay and does not resend the server echo', async () => {
    const send = vi.fn(echo);
    const { result } = setup(send);
    act(() => result.current.setProtocol({ ...base, judge_notes: 'a' }));
    expect(result.current.autosave.saveState).toBe('unsaved');
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(send).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.autosave.saveState).toBe('saved');
    expect(result.current.protocol.updated_at).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('an edit made while a save is on its way is sent next; the older answer does not overwrite it', async () => {
    let release: (value: any) => void = () => {};
    const send = vi.fn((protocol: any, playerResults: any[]) => (send.mock.calls.length === 1
      ? new Promise((resolve) => { release = () => resolve({ protocol: { ...protocol, updated_at: 'old' }, player_results: playerResults }); })
      : echo(protocol, playerResults)));
    const { result } = setup(send);
    act(() => result.current.setProtocol({ ...base, judge_notes: 'a' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    act(() => result.current.setProtocol({ ...base, judge_notes: 'ab' }));
    await act(async () => { release(null); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.protocol.judge_notes).toBe('ab');
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].judge_notes).toBe('ab');
    expect(result.current.autosave.saveState).toBe('saved');
  });

  it('a hold keeps the edit unsaved with its reason, and a failure says so', async () => {
    const send = vi.fn(echo);
    const { result } = setup(send, { hold: (protocol: any) => (protocol.judge_notes === 'held' ? 'Сначала классифицируйте' : null) });
    act(() => result.current.setProtocol({ ...base, judge_notes: 'held' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(send).not.toHaveBeenCalled();
    expect(result.current.autosave.saveState).toBe('unsaved');
    expect(result.current.autosave.saveError).toBe('Сначала классифицируйте');
    send.mockRejectedValueOnce(new Error('Сервер недоступен'));
    act(() => result.current.setProtocol({ ...base, judge_notes: 'x' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.autosave.saveState).toBe('error');
    expect(result.current.autosave.saveError).toBe('Сервер недоступен');
  });

  it('flush sends what is left before the window closes and says whether everything is saved', async () => {
    const send = vi.fn(echo);
    const { result } = setup(send);
    await act(async () => { expect(await result.current.autosave.flush()).toBe(true); });
    expect(send).not.toHaveBeenCalled();
    act(() => result.current.setProtocol({ ...base, judge_notes: 'a' }));
    await act(async () => { expect(await result.current.autosave.flush()).toBe(true); });
    expect(send).toHaveBeenCalledTimes(1);
    send.mockRejectedValueOnce(new Error('нет сети'));
    act(() => result.current.setProtocol({ ...base, judge_notes: 'b' }));
    await act(async () => { expect(await result.current.autosave.flush()).toBe(false); });
  });
});
