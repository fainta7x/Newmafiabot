/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizerCommandCenter from '../components/crm/OrganizerCommandCenter.tsx';

const currentEvening = {
  id: 'current', title: '11 сентября', starts_at: '2026-09-11T17:00:00.000Z', venue: 'Суп с котом', format: 'CASUAL', status: 'published',
};

const responseBody = (input: { currentDue?: number; currentPaid?: number; previousDue?: number; generated?: string } = {}) => {
  const currentDue = input.currentDue ?? 400;
  const currentPaid = input.currentPaid ?? 0;
  const previousDue = input.previousDue ?? 0;
  const currentUnpaid = currentDue > currentPaid;
  return {
    snapshot: {
      mode: 'upcoming',
      evening: currentEvening,
      stats: {
        expected: 1, present: 0, pending_attendance: 0, no_show: 0,
        unpaid_count: currentUnpaid ? 1 : 0,
        unpaid_amount: currentUnpaid ? currentDue - currentPaid : 0,
        games: 0, completed_games: 0, draft_games: 0, open_tasks: 0, ready_to_close: false,
      },
      payment_context: {
        scope: 'current_or_upcoming_evening', evening: currentEvening,
        unpaid_count: currentUnpaid ? 1 : 0, unpaid_amount: currentUnpaid ? currentDue - currentPaid : 0,
      },
      current_game: null,
      suggested_lineup: [],
      roster: { expected: [], present: [], pending_attendance: [], unpaid: [] },
      attention: { communication: [], tasks: [] },
      blockers: [],
    },
    wrapup: previousDue > 0 ? {
      payment_scope: 'previous_evening_debt',
      evening: { id: 'previous', title: '4 сентября', starts_at: '2026-09-04T17:00:00.000Z' },
      unpaid: [{ id: 'old-row', player_id: 'millourt', nickname: 'Millourt', amount_due: previousDue, amount_paid: 0 }],
      tasks: [],
    } : null,
    generated_at: input.generated ?? new Date().toISOString(),
  };
};

const jsonResponse = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
}));

const props = {
  overview: null,
  onOpenEvening: vi.fn(),
  onOpenEveningSection: vi.fn(),
  onOpenPlayer: vi.fn(),
  onNavigateTab: vi.fn(),
  onCreateEvening: vi.fn(),
};

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('OrganizerCommandCenter payment freshness', () => {
  it('uses no-store and lets only the latest parallel response update CRM payments', async () => {
    let resolveSlow!: (value: Response) => void;
    const slow = new Promise<Response>((resolve) => { resolveSlow = resolve; });
    let call = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('/api/crm/command-center');
      expect(init?.cache).toBe('no-store');
      call += 1;
      if (call === 1) return jsonResponse(responseBody({ currentDue: 400 }));
      if (call === 2) return slow;
      return jsonResponse(responseBody({ currentDue: 0, generated: 'newest' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OrganizerCommandCenter {...props} />);
    expect(await screen.findByText('400 ₽', { exact: false })).toBeDefined();

    const refresh = screen.getByRole('button', { name: 'Обновить' });
    fireEvent.click(refresh);
    fireEvent.click(refresh);
    await waitFor(() => expect(screen.queryByText('400 ₽', { exact: false })).toBeNull());

    resolveSlow(await jsonResponse(responseBody({ currentDue: 600, generated: 'stale' })));
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    expect(screen.queryByText('600 ₽', { exact: false })).toBeNull();
    expect(screen.queryByText('400 ₽', { exact: false })).toBeNull();
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('hides old payment amounts immediately on Telegram resume while refreshing in place', async () => {
    let resolveResume!: (value: Response) => void;
    const resumeResponse = new Promise<Response>((resolve) => { resolveResume = resolve; });
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(() => {
      call += 1;
      if (call === 1) return jsonResponse(responseBody({ currentDue: 400, previousDue: 600 }));
      return resumeResponse;
    }));

    render(<OrganizerCommandCenter {...props} />);
    expect(await screen.findByText('400 ₽', { exact: false })).toBeDefined();
    expect(screen.getByText('Долги с прошлого вечера · не текущая оплата')).toBeDefined();
    expect(screen.getByText('долг за 4 сентября: 600 ₽')).toBeDefined();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    fireEvent(document, new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    fireEvent(document, new Event('visibilitychange'));

    expect(await screen.findByTestId('crm-payments-refreshing')).toBeDefined();
    expect(screen.queryByText('400 ₽', { exact: false })).toBeNull();
    expect(screen.queryByText('долг за 4 сентября: 600 ₽')).toBeNull();
    expect(screen.getByText('11 сентября')).toBeDefined();

    await new Promise<void>((resolve) => { setTimeout(resolve, 100); });
    resolveResume(await jsonResponse(responseBody({ currentDue: 0, previousDue: 0 })));
    await waitFor(() => expect(screen.queryByTestId('crm-payments-refreshing')).toBeNull());
    expect(screen.queryByText('600 ₽', { exact: false })).toBeNull();
  });

  it('labels current payments and previous-evening debts with different evening title/date context', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(responseBody({ currentDue: 400, previousDue: 300 }))));
    render(<OrganizerCommandCenter {...props} />);

    expect(await screen.findByText('Не оплачено · этот вечер')).toBeDefined();
    expect(screen.getByText(/11 сентября.*400 ₽/)).toBeDefined();
    const previous = screen.getByTestId('previous-evening-debts');
    expect(previous.textContent).toContain('Долги с прошлого вечера · не текущая оплата');
    expect(previous.textContent).toContain('4 сентября');
    expect(previous.textContent).toContain('300 ₽');
  });
});
