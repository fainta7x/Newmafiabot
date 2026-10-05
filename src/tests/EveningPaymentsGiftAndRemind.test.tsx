// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EveningPaymentsPanel from '../components/crm/EveningPaymentsPanel';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const row = (id: string, nickname: string, extra: Record<string, unknown> = {}) => ({ id, player_id: `p-${id}`, nickname, payment_status: 'unpaid', amount_due: 300, amount_paid: 0, fee_waived: false, ...extra });
const payload = (format: string, participants: any[]) => ({ evening: { id: 'e1', title: 'Вечер', status: 'completed', closed: true, format }, participants });

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('payments panel: gift an evening and remind the debtors (owner, 2026-10-05)', () => {
  it('gifts the evening after a confirmation, as the ordinary waiver, and can take it back', async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (method === 'PATCH' && calls.at(-1)!.body.waived === true) return json(payload('CASUAL', [row('a', 'Аня', { payment_status: 'waived', amount_due: 0, fee_waived: true }), row('b', 'Боря')]));
      if (method === 'PATCH') return json(payload('CASUAL', [row('a', 'Аня'), row('b', 'Боря')]));
      return json(payload('CASUAL', [row('a', 'Аня'), row('b', 'Боря')]));
    }));
    render(<EveningPaymentsPanel eveningId="e1" />);
    fireEvent.click(await screen.findByTestId('gift-evening-a'));
    expect(await screen.findByText('Подарить вечер?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Подарить' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH' && call.body.waived === true && call.body.reason === 'Подарочный вечер')).toBe(true));
    expect(await screen.findByText('Освобождён от оплаты')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуть оплату' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH' && call.body.waived === false)).toBe(true));
    await waitFor(() => expect(screen.queryByText('Освобождён от оплаты')).toBeNull());
  });

  it('offers no gift button on evenings of other formats', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(payload('RATING', [row('a', 'Аня')]))));
    render(<EveningPaymentsPanel eveningId="e1" />);
    await screen.findByText('Аня');
    expect(screen.queryByTestId('gift-evening-a')).toBeNull();
  });

  it('reminds the debtors after a confirmation and reports how many messages went out', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method || 'GET';
      calls.push({ url, method });
      if (url.endsWith('/payment-reminders')) return json({ success: true, debtors: 2, queued: 2, skipped_recent: 0, undeliverable: 0 });
      return json(payload('CASUAL', [row('a', 'Аня'), row('b', 'Боря'), row('c', 'Вера', { payment_status: 'paid', amount_paid: 300 })]));
    }));
    render(<EveningPaymentsPanel eveningId="e1" />);
    fireEvent.click(await screen.findByTestId('remind-debtors'));
    expect(screen.getByTestId('remind-debtors').textContent).toContain('(2)');
    expect(await screen.findByText(/Бот напишет лично 2 игрокам/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Напомнить' }));
    expect(await screen.findByText(/Отправлено: 2/)).toBeTruthy();
    expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/api/evenings/e1/payment-reminders'))).toBe(true);
  });
});
