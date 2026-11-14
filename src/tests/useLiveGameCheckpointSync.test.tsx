// @vitest-environment jsdom
import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLiveGameCheckpoint } from '../components/game/useLiveGameCheckpoint.ts';
import { liveGameCheckpointApi, readCheckpointRevision, writeLiveGameCheckpoint } from '../lib/liveGameCheckpoint.ts';
import { clubLiveSessionKey, clubLiveEvidenceKey, clubLiveDeathProtocolKey, clubLiveProtocolNotesKey } from '../lib/liveClubSession.ts';
import { RequestJsonError } from '../lib/requestJson.ts';

const key = 'club:7' as const;
const session = (round = 2) => JSON.stringify({ phase: 'day_speeches', roundNumber: round, activePlayers: [] });
beforeEach(() => { localStorage.clear(); localStorage.setItem(clubLiveSessionKey(7), session()); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('keeps one writer revision across phase changes and reports network failures without stopping local play', async () => {
  const save = vi.spyOn(liveGameCheckpointApi, 'save').mockResolvedValueOnce({ ok: true, revision: 'r1' }).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ ok: true, revision: 'r2' });
  const { result, rerender } = renderHook(({ phase }) => useLiveGameCheckpoint(key, phase, true), { initialProps: { phase: 'day_speeches' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(save.mock.calls[0][2]).toBeNull();
  expect(readCheckpointRevision(key)).toBe('r1');
  localStorage.setItem(clubLiveSessionKey(7), session(3));
  rerender({ phase: 'night' });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(result.current.error).toContain('не обновляется');
  expect(JSON.parse(localStorage.getItem(clubLiveSessionKey(7))!).roundNumber).toBe(3);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(save.mock.calls[2][2]).toBe('r1');
  expect(result.current.error).toBeNull();
  expect(readCheckpointRevision(key)).toBe('r2');
});

it('stops automatic overwrites on conflict and uses an explicit handover with a fresh revision', async () => {
  const save = vi.spyOn(liveGameCheckpointApi, 'save').mockRejectedValueOnce(new RequestJsonError('Conflict', 409, { code: 'checkpoint_conflict' })).mockResolvedValue({ ok: true, revision: 'r3' });
  const load = vi.spyOn(liveGameCheckpointApi, 'load').mockResolvedValue({ session: session(5), saved_at: '', revision: 'r2' });
  const { result } = renderHook(() => useLiveGameCheckpoint(key, 'day_speeches', true));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(result.current.conflict).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(12_000); });
  expect(save).toHaveBeenCalledTimes(1);
  expect(load).not.toHaveBeenCalled();
  await act(async () => { await result.current.useThisDevice(); });
  expect(save.mock.calls[1][2]).toBe('r2');
  expect(JSON.parse(save.mock.calls[1][1].session).roundNumber).toBe(2);
  expect(result.current.error).toBeNull();
});

it('a second tab changing localStorage cannot authorize this writer to overwrite its state', async () => {
  writeLiveGameCheckpoint(key, { session: session(), revision: 'old' });
  const save = vi.spyOn(liveGameCheckpointApi, 'save').mockResolvedValue({ ok: true, revision: 'mine' });
  const { rerender } = renderHook(({ phase }) => useLiveGameCheckpoint(key, phase, true), { initialProps: { phase: 'setup' } });
  localStorage.setItem('mafia_checkpoint_revision:club:7', 'another-tab');
  // Starting the game must retain the revision captured by THIS writer.
  // Re-rendering a phase is intentionally not a new writer.
  rerender({ phase: 'day_speeches' });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(save.mock.calls[0][2]).toBe('old');
});

it('restoring the server copy stores its revision and clears stale protocol details', () => {
  writeLiveGameCheckpoint(key, { session: session(), evidence: 'old evidence', death_protocols: 'old wills', notes: 'old notes', revision: 'old' });
  writeLiveGameCheckpoint(key, { session: session(5), revision: 'new' });
  expect(readCheckpointRevision(key)).toBe('new');
  expect([clubLiveEvidenceKey(7), clubLiveDeathProtocolKey(7), clubLiveProtocolNotesKey(7)].map(storageKey => localStorage.getItem(storageKey))).toEqual([null, null, null]);
});
