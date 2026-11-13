// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EveningNextStepBanner } from '../components/crm/EveningNextStepBanner.tsx';

const mockCloseout = (games: { total: number; completed: number; unfinished: unknown[] }) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ games }) })));
};

describe('EveningNextStepBanner', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('points a running evening with every game finished to closing it', async () => {
    mockCloseout({ total: 3, completed: 3, unfinished: [] });
    const onOpenCloseout = vi.fn();
    render(<EveningNextStepBanner eveningId="e1" status="active" onOpenCloseout={onOpenCloseout} />);
    await waitFor(() => expect(screen.getByText('Все игры сыграны')).toBeTruthy());
    expect(screen.getByText(/3 игры/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('evening-next-step-close'));
    expect(onOpenCloseout).toHaveBeenCalledOnce();
  });

  it('stays hidden while games are unfinished or the evening is not running', async () => {
    mockCloseout({ total: 3, completed: 2, unfinished: [{ id: 1 }] });
    const { container, rerender } = render(<EveningNextStepBanner eveningId="e1" status="active" onOpenCloseout={() => undefined} />);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(container.textContent).toBe('');
    mockCloseout({ total: 3, completed: 3, unfinished: [] });
    rerender(<EveningNextStepBanner eveningId="e1" status="published" onOpenCloseout={() => undefined} />);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(container.textContent).toBe('');
  });

  it('stays on screen while it is re-checked after an action (the refresh key changes)', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      calls += 1;
      const body = { ok: true, json: async () => ({ games: { total: 3, completed: 3, unfinished: [] } }) };
      return calls === 1 ? Promise.resolve(body) : new Promise((resolve) => { setTimeout(() => resolve(body), 40); });
    }));
    const { rerender } = render(<EveningNextStepBanner eveningId="e1" status="active" refreshKey={0} onOpenCloseout={() => undefined} />);
    await waitFor(() => expect(screen.getByText('Все игры сыграны')).toBeTruthy());
    const banner = screen.getByText('Все игры сыграны');
    rerender(<EveningNextStepBanner eveningId="e1" status="active" refreshKey={1} onOpenCloseout={() => undefined} />);
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    expect(banner.isConnected).toBe(true);
    await waitFor(() => expect(calls).toBeGreaterThan(1));
    expect(banner.isConnected).toBe(true);
  });

  it('appears once the last game finishes while the evening is open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finished = false;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ games: finished ? { total: 2, completed: 2, unfinished: [] } : { total: 2, completed: 1, unfinished: [{ id: 2 }] } }) })));
    render(<EveningNextStepBanner eveningId="e1" status="active" onOpenCloseout={() => undefined} />);
    await vi.advanceTimersByTimeAsync(50);
    expect(screen.queryByText('Все игры сыграны')).toBeNull();
    finished = true;
    await vi.advanceTimersByTimeAsync(20_000);
    await waitFor(() => expect(screen.getByText('Все игры сыграны')).toBeTruthy());
    vi.useRealTimers();
  });
});
