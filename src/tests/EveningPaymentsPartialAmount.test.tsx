// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EveningPaymentsPanel from '../components/crm/EveningPaymentsPanel';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const row = (paid: number, status: string) => ({ id: 'a', player_id: 'p-a', nickname: 'Перец', payment_status: status, amount_due: 400, amount_paid: paid, fee_waived: false });
const payload = (participant: any) => ({ evening: { id: 'e1', title: 'Вечер', status: 'completed', closed: true, format: 'CASUAL' }, participants: [participant] });

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('payments panel: a part of the sum by hand (owner, 2026-10-22)', () => {
  it('saves a partial amount and shows what is left as the debt', async () => {
    const calls: Array<{ method: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, body });
      return json(method === 'PATCH' ? payload(row(200, 'partial')) : payload(row(0, 'unpaid')));
    }));
    render(<EveningPaymentsPanel eveningId="e1" />);
    expect(await screen.findByText(/Не оплачено · 400/)).toBeTruthy();
    fireEvent.click(screen.getByTestId('payment-amount-a'));
    const input = await screen.findByLabelText('Сколько получено, ₽');
    fireEvent.change(input, { target: { value: '200' } });
    expect(screen.getByText(/Останется долг: 200/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(calls.some((call) => call.method === 'PATCH' && call.body.amount_paid === 200)).toBe(true));
    expect(await screen.findByText(/Оплачено 200 ₽ из 400 ₽ · долг 200 ₽/)).toBeTruthy();
  });

  it('does not allow more than the price', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(payload(row(0, 'unpaid')))));
    render(<EveningPaymentsPanel eveningId="e1" />);
    fireEvent.click(await screen.findByTestId('payment-amount-a'));
    fireEvent.change(await screen.findByLabelText('Сколько получено, ₽'), { target: { value: '500' } });
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
