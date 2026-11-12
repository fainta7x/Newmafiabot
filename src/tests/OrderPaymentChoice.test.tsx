// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import OrderPaymentChoice, { type OrderPayment } from '../components/player/OrderPaymentChoice.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const answer = (body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })));
function Host({ initial = 'rubles' as OrderPayment }) { const [value, setValue] = useState<OrderPayment>(initial); return <><OrderPaymentChoice kind="role" rubles={150} value={value} onChange={setValue} /><output data-testid="value">{value}</output></>; }

describe('«рубли или жетоны» for a role or a song', () => {
  it('offers both ways with the token price and the balance', async () => {
    answer({ tokenPrices: { role: 10000, music: 5000 }, balance: 12000 });
    render(<Host />);
    expect(await screen.findByLabelText(/Жетонами 10 000/)).toBeTruthy();
    expect(screen.getByLabelText(/Рублями 150 ₽/)).toBeTruthy();
  });
  it('does not let a player with too few tokens choose them', async () => {
    answer({ tokenPrices: { role: 10000, music: 5000 }, balance: 100 });
    render(<Host />);
    const tokens = await screen.findByLabelText(/Жетонами 10 000/);
    expect((tokens as HTMLInputElement).disabled).toBe(true);
  });
  it('shows nothing and falls back to rubles when the organizer switched token payment off', async () => {
    answer({ tokenPrices: { role: null, music: null }, balance: 12000 });
    render(<Host initial="tokens" />);
    await waitFor(() => expect(screen.getByTestId('value').textContent).toBe('rubles'));
    expect(screen.queryByTestId('order-payment-role')).toBeNull();
  });
});
