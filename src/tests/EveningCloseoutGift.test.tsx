// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EveningCloseoutPanel from '../components/crm/EveningCloseoutPanel';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const participant = (id: string, nickname: string, extra: Record<string, unknown> = {}) => ({ id, player_id: `p-${id}`, nickname, response_status: 'going', registration_status: 'going', attendance_status: 'attended', payment_status: 'unpaid', amount_due: 300, amount_paid: 0, ...extra });
const state = (format: string, participants: any[]) => ({
  evening: { id: 'e1', title: 'Вечер', starts_at: '2020-01-01T17:00:00Z', format, status: 'active', settled_at: null },
  participants, pending_expected: [], attended: participants, no_show: [], unplanned_attended: [],
  outstanding: participants.filter((item) => item.payment_status !== 'waived' && item.amount_due > item.amount_paid).map((item) => ({ ...item, balance: item.amount_due - item.amount_paid })),
  games: { total: 2, completed: 2, unfinished: [], needs_override: false }, can_close_without_override: true, can_close_with_override: true,
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('closing an evening: pay or gift each debtor first (owner, 2026-10-05)', () => {
  it('gifts a debtor with the ordinary waiver and refreshes the list; unmarked players are told they will be charged', async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];
    let gifted = false;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method || 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (method === 'PATCH' && url.includes('/payments/')) { gifted = true; return json({}); }
      return json(state('CASUAL', [participant('a', 'Аня', gifted ? { payment_status: 'waived', amount_due: 0 } : {}), participant('b', 'Боря')]));
    }));
    render(<EveningCloseoutPanel eveningId="e1" />);
    fireEvent.click(await screen.findByTestId('closeout-gift-a'));
    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH' && call.url.endsWith('/payments/a') && call.body.waived === true && call.body.reason === 'Подарочный вечер')).toBe(true));
    await waitFor(() => expect(screen.queryByTestId('closeout-gift-a')).toBeNull());
    expect(screen.getByTestId('closeout-gift-b')).toBeTruthy();
    expect(screen.getByText(/Кого не отметишь — тому после закрытия вечера начислится долг/)).toBeTruthy();
  });

  it('has no gift button on evenings of other formats', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(state('RATING', [participant('a', 'Аня')]))));
    render(<EveningCloseoutPanel eveningId="e1" />);
    await screen.findByText('Аня');
    expect(screen.queryByTestId('closeout-gift-a')).toBeNull();
  });
});

describe('closed evening summary (owner, 2026-10-06)', () => {
  it('opens the matching list from the summary tiles', async () => {
    const closed = { ...state('CASUAL', [participant('a', 'Аня', { amount_paid: 100 }), participant('b', 'Боря')]) };
    closed.evening = { ...closed.evening, status: 'completed', settled_at: '2020-01-02T00:00:00Z' } as any;
    vi.stubGlobal('fetch', vi.fn(() => json(closed)));
    const opened: any[] = [];
    render(<EveningCloseoutPanel eveningId="e1" onOpen={(target) => opened.push(target)} />);
    fireEvent.click(await screen.findByTestId('closeout-tile-came'));
    fireEvent.click(screen.getByTestId('closeout-tile-paid'));
    fireEvent.click(screen.getByTestId('closeout-tile-debt'));
    expect(opened).toEqual([{ pane: 'roster' }, { pane: 'payments', filter: 'paid' }, { pane: 'payments', filter: 'unpaid' }]);
  });
});

