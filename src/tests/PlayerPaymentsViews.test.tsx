/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PlayerPayments from '../components/player/PlayerPayments.tsx';

const payment = { participant_id: 'p1', evening_id: 'e1', title: 'Предстоящий вечер', starts_at: '2026-10-10T16:00:00Z', venue: null, amount_due: 400, amount_paid: 0, outstanding: 400, payment_status: 'unpaid' };
const data = { summary: { historical_debt: 400, amount_paid: 800 }, current: [payment], history: [{ ...payment, participant_id: 'p0', title: 'Прошлый вечер', outstanding: 0, amount_paid: 400, payment_status: 'paid' }], free_evening_credits: 2 };
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(data), { status: 200 })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState({}, '', '/'); });

it('keeps the complete standalone payment screen by default', async () => {
  render(<PlayerPayments />);
  await screen.findByText('По игровым вечерам');
  expect(screen.getByRole('heading', { name: 'Оплата' })).toBeTruthy();
  expect(screen.getByText('Предстоящий вечер')).toBeTruthy();
  expect(screen.getByText('Прошлый вечер')).toBeTruthy();
});

it('retains paid totals, credits and the free-evening action without repeating wallet debt/history', async () => {
  render(<PlayerPayments view="current" />);
  const action = await screen.findByRole('button', { name: /Использовать бесплатный вечер/ });
  expect(screen.getByText('оплачено всего')).toBeTruthy();
  expect(screen.getByText('бесплатных вечеров')).toBeTruthy();
  expect(screen.queryByText('По игровым вечерам')).toBeNull();
  expect(screen.queryByText('Прошлый вечер')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Оплата' })).toBeNull();
  fireEvent.click(action);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/player/payments/p1/use-free-evening', { method: 'POST', credentials: 'include' }));
});

it('shows only payment history in the wallet history tab', async () => {
  render(<PlayerPayments view="history" />);
  await screen.findByText('Прошлый вечер');
  expect(screen.queryByText('Предстоящий вечер')).toBeNull();
  expect(screen.queryByText('По игровым вечерам')).toBeNull();
  expect(screen.queryByRole('button', { name: /Использовать бесплатный вечер/ })).toBeNull();
});

it('shows test checkout only when enabled and sends a provider POST without a client amount', async () => {
  const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
    expect(this.action).toBe('https://auth.robokassa.ru/Merchant/Index.aspx');
    expect(this.method).toBe('post');
    expect(new FormData(this).get('IsTest')).toBe('1');
  });
  fetchMock.mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(url.includes('/checkout/')
    ? { method: 'POST', action: 'https://auth.robokassa.ru/Merchant/Index.aspx', fields: { IsTest: '1', OutSum: '400.00', InvId: '123', SignatureValue: 'fixture-signature' } }
    : { ...data, robokassa_test_available: true }), { status: 200 })));
  render(<PlayerPayments view="current" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Тест оплаты · 400 ₽' }));
  await waitFor(() => expect(submit).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith('/api/payments/robokassa/test/checkout/p1', { method: 'POST', credentials: 'include' });
  expect(document.querySelector('form')).toBeNull();
});

it('does not offer test checkout in an ordinary wallet', async () => {
  render(<PlayerPayments view="current" />);
  await screen.findByText('Предстоящий вечер');
  expect(screen.queryByRole('button', { name: /Тест оплаты/ })).toBeNull();
});

it('checks server confirmation after a return instead of trusting a success redirect', async () => {
  window.history.replaceState({}, '', '/player/wallet?robokassa_test_return=success&robokassa_test_invoice=123');
  fetchMock.mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(url.includes('/invoices/')
    ? { id: '123', status: 'pending', test: true } : data), { status: 200 })));
  render(<PlayerPayments view="current" />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/payments/robokassa/test/invoices/123', { credentials: 'include' }));
  expect(screen.queryByText(/Robokassa подтвердила тестовую оплату/)).toBeNull();
});

it('shows confirmation only from the invoice status and explains that the debt is unchanged', async () => {
  window.history.replaceState({}, '', '/player/wallet?robokassa_test_return=fail&robokassa_test_invoice=123');
  fetchMock.mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(url.includes('/invoices/')
    ? { id: '123', status: 'confirmed', test: true } : data), { status: 200 })));
  render(<PlayerPayments view="current" />);
  expect(await screen.findByText('Robokassa подтвердила тестовую оплату. Деньги не списаны, долг не изменён.')).toBeTruthy();
});
