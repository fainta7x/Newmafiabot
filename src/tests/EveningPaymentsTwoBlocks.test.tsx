// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EveningPaymentsPanel from '../components/crm/EveningPaymentsPanel';
import { organizerEveningPath, parseOrganizerRoute } from '../components/crm/organizerRouting.ts';

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const row = (id: string, nickname: string, extra: Record<string, unknown> = {}) => ({ id, player_id: `p-${id}`, nickname, payment_status: 'unpaid', amount_due: 300, amount_paid: 0, fee_waived: false, ...extra });
const payload = (participants: any[]) => ({ evening: { id: 'e1', title: 'Вечер', status: 'completed', closed: true, format: 'CASUAL' }, participants });

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('evening payments: two blocks and a direct route (owner, 2026-10-12)', () => {
  it('shows debtors first and the paid below, each block with its count and sum', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(payload([
      row('a', 'Аня'), row('b', 'Боря', { amount_due: 200 }),
      row('c', 'Вера', { payment_status: 'paid', amount_paid: 300 }),
      row('d', 'Гена', { payment_status: 'waived', amount_due: 0, fee_waived: true }),
    ]))));
    render(<EveningPaymentsPanel eveningId="e1" />);
    const unpaid = await screen.findByTestId('evening-payments-group-unpaid');
    const paid = screen.getByTestId('evening-payments-group-paid');
    const free = screen.getByTestId('evening-payments-group-free');
    expect(unpaid.textContent).toContain('Не оплатили · 2');
    expect(unpaid.textContent).toContain('500');
    expect(within(unpaid).getByText('Аня')).toBeTruthy();
    expect(within(unpaid).getByText('Боря')).toBeTruthy();
    expect(paid.textContent).toContain('Оплатили · 1');
    expect(within(paid).getByText('Вера')).toBeTruthy();
    expect(free.textContent).toContain('Без оплаты · 1');
    expect(unpaid.compareDocumentPosition(paid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps one flat list for a chip filter and for a search', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(payload([row('a', 'Аня'), row('c', 'Вера', { payment_status: 'paid', amount_paid: 300 })]))));
    render(<EveningPaymentsPanel eveningId="e1" />);
    await screen.findByTestId('evening-payments-group-unpaid');
    fireEvent.click(screen.getByRole('button', { name: /Не оплатили/ }));
    expect(screen.queryByTestId('evening-payments-group-unpaid')).toBeNull();
    expect(screen.getByText('Аня')).toBeTruthy();
    expect(screen.queryByText('Вера')).toBeNull();
  });

  it('opens the payments pane of an evening by its own address', () => {
    expect(organizerEveningPath('e1', 'payments')).toBe('/admin/evenings/e1/payments');
    expect(parseOrganizerRoute('/admin/evenings/e1/payments')).toMatchObject({ tab: 'evenings', eveningId: 'e1', eveningSection: 'payments' });
  });
});
