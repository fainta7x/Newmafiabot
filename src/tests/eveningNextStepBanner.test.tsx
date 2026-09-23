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
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe('');
    mockCloseout({ total: 3, completed: 3, unfinished: [] });
    rerender(<EveningNextStepBanner eveningId="e1" status="published" onOpenCloseout={() => undefined} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe('');
  });
});
