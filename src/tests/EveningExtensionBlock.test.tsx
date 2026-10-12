// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EveningPaymentsPanel from '../components/crm/EveningPaymentsPanel';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const row = (id: string, nickname: string, extra: Record<string, unknown> = {}) => ({ id, player_id: `p-${id}`, nickname, payment_status: 'unpaid', amount_due: 300, amount_paid: 0, fee_waived: false, ...extra });
const payload = (participants: any[], extensions: any[] = [], closed = true) => ({ evening: { id: 'e1', title: 'Вечер', status: closed ? 'completed' : 'active', closed, format: 'RATING' }, participants, extensions });

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('payments: «Продлить вечер»', () => {
  it('sends the number of games and the amount and shows the new line of the player', async () => {
    const calls: Array<{ url: string; method: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method || 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (method === 'POST') return json(payload([row('a', 'Аня', { amount_due: 383, extension_due: 83 })], [{ id: 'x1', games_count: 2, amount: 250, note: null }]), 201);
      return json(payload([row('a', 'Аня')]));
    }));
    render(<EveningPaymentsPanel eveningId="e1" />);
    fireEvent.click(await screen.findByTestId('extension-open'));
    const submit = screen.getByTestId('extension-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('extension-games'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('extension-amount'), { target: { value: '250' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/api/evenings/e1/extensions') && call.body.games_count === 2 && call.body.amount === 250)).toBe(true));
    expect(await screen.findByTestId('extension-row-x1')).toBeTruthy();
    expect(screen.getByText(/вечер 300 ₽ \+ продление 83 ₽/)).toBeTruthy();
  });

  it('removes an extension after a confirmation', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method || 'GET';
      calls.push({ url, method });
      if (method === 'DELETE') return json(payload([row('a', 'Аня')], []));
      return json(payload([row('a', 'Аня', { amount_due: 383, extension_due: 83 })], [{ id: 'x1', games_count: 2, amount: 250, note: 'Бар' }]));
    }));
    render(<EveningPaymentsPanel eveningId="e1" />);
    expect(await screen.findByText('Бар')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Убрать продление/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Убрать' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.url.endsWith('/extensions/x1'))).toBe(true));
    await waitFor(() => expect(screen.queryByTestId('extension-row-x1')).toBeNull());
  });
});
