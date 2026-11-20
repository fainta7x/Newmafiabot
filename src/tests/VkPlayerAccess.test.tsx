/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VkPlayerAccess from '../components/player/VkPlayerAccess.tsx';

const key = 'vk-login-pending:v1';
const state = 'a'.repeat(40);
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const start = () => json({ authorize_url: `https://id.vk.test/authorize?state=${state}` });
const tap = async (name = 'Продолжить через VK') => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })); });
};
const stalled = (signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
});

describe('VK entry recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(window, 'open').mockReturnValue({ closed: false, location: { href: '' }, close: vi.fn() } as unknown as Window);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps polling without storage and reports a terminal server error with a usable retry', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    const fetcher = vi.fn().mockResolvedValueOnce(start())
      .mockResolvedValueOnce(json({ status: 'pending' }))
      .mockResolvedValueOnce(json({ status: 'error', code: 'vk_state_expired' }));
    vi.stubGlobal('fetch', fetcher);
    render(<VkPlayerAccess />);
    await tap();
    expect(screen.getByTestId('vk-player-access-waiting')).toBeTruthy();
    expect(fetcher.mock.calls[0][0]).toBe('/api/integrations/player/vk/start');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ return_to: '/player' });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ state });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(screen.getByText(/Сессия входа через VK устарела/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Продолжить через VK' }) as HTMLButtonElement).disabled).toBe(false);
  });

  for (const phase of ['headers', 'body'] as const) {
    it(`bounds a stalled start response (${phase}) and lets the next attempt succeed`, async () => {
      const fetcher = vi.fn(async (_url, options): Promise<{ ok: boolean; json: () => Promise<unknown> }> => {
        if (phase === 'headers') return stalled(options.signal);
        return { ok: true, json: () => stalled(options.signal) };
      });
      vi.stubGlobal('fetch', fetcher);
      render(<VkPlayerAccess />);
      await tap();
      expect((screen.getByRole('button', { name: 'Открываем VK ID…' }) as HTMLButtonElement).disabled).toBe(true);
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(screen.getByText(/Сервер не ответил/)).toBeTruthy();
      const popup = vi.mocked(window.open).mock.results[0].value;
      expect(popup?.close).toHaveBeenCalledOnce();
      fetcher.mockImplementation(async (url) => String(url).endsWith('/start') ? start() : json({ status: 'pending' }));
      await tap();
      expect(screen.getByTestId('vk-player-access-waiting')).toBeTruthy();
    });
  }

  it('retries a stalled handoff instead of occupying the poll forever', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (String(url).endsWith('/start')) return start();
      if (++calls === 1) return stalled(options.signal);
      return json({ status: 'expired' });
    }));
    render(<VkPlayerAccess />);
    await tap();
    await act(async () => { await vi.advanceTimersByTimeAsync(17_000); });
    expect(calls).toBe(2);
    expect((screen.getByRole('button', { name: 'Продолжить через VK' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('releases the busy button when a running login expires locally', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => String(url).endsWith('/start') ? start() : json({ status: 'pending' })));
    render(<VkPlayerAccess />);
    await tap();
    vi.setSystemTime(Date.now() + 30 * 60_000);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect((screen.getByRole('button', { name: 'Продолжить через VK' }) as HTMLButtonElement).disabled).toBe(false);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('ignores an old handoff response after cancel and retry', async () => {
    let finishOld!: (response: Response) => void;
    let handoffs = 0;
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).endsWith('/start')) return start();
      if (++handoffs === 1) return new Promise<Response>((resolve) => { finishOld = resolve; });
      return json({ status: 'pending' });
    }));
    render(<VkPlayerAccess />);
    await tap();
    await tap('Отменить');
    await tap();
    await act(async () => { finishOld(json({ status: 'error', code: 'vk_state_mismatch' })); });
    expect(screen.getByTestId('vk-player-access-waiting')).toBeTruthy();
    expect(handoffs).toBe(2);
  });

  it('resumes a remembered pending login without opening another VK window', async () => {
    localStorage.setItem(key, JSON.stringify({ state, at: Date.now() }));
    const fetcher = vi.fn().mockResolvedValue(json({ status: 'pending' }));
    vi.stubGlobal('fetch', fetcher);
    await act(async () => { render(<VkPlayerAccess />); });
    expect(fetcher.mock.calls[0][0]).toBe('/api/integrations/player/vk/handoff');
    expect(window.open).not.toHaveBeenCalled();
    expect(screen.getByTestId('vk-player-access-waiting')).toBeTruthy();
  });
});
