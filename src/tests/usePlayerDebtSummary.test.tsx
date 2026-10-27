/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlayerDebtSummary } from '../hooks/usePlayerDebtSummary.ts';

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('confirmed player debt summary', () => {
  it.each(['http', 'network', 'malformed'])('reports %s failure as unknown and recovers through retry', async (failure) => {
    const fetch = vi.fn().mockImplementationOnce(async () => {
      if (failure === 'network') throw new Error('Offline');
      return failure === 'http' ? response({ error: 'Unavailable' }, 503) : response({ summary: {} });
    }).mockResolvedValue(response({ summary: { historical_debt: 200 } }));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => usePlayerDebtSummary('home'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.amount).toBeNull();
    await act(async () => { await result.current.reload(); });
    expect(result.current.status).toBe('ready');
    expect(result.current.amount).toBe(200);
  });
  it('retains the last confirmed amount on a failed refresh instead of reporting zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ summary: { historical_debt: 350 } })).mockRejectedValueOnce(new Error('Offline')));
    const { result, rerender } = renderHook(({ view }) => usePlayerDebtSummary(view), { initialProps: { view: 'shop' } });
    await waitFor(() => expect(result.current.amount).toBe(350));
    rerender({ view: 'history' });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.amount).toBe(350);
  });
  it('ignores an older response that arrives after a newer view request', async () => {
    let finishOld!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; })).mockResolvedValueOnce(response({ summary: { historical_debt: 100 } })));
    const { result, rerender } = renderHook(({ view }) => usePlayerDebtSummary(view), { initialProps: { view: 'shop' } });
    rerender({ view: 'history' });
    await waitFor(() => expect(result.current.amount).toBe(100));
    await act(async () => { finishOld(response({ summary: { historical_debt: 900 } })); });
    expect(result.current.amount).toBe(100);
    expect(result.current.status).toBe('ready');
  });
});
