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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
