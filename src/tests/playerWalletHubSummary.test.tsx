/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../components/player/PlayerEconomyPanel.tsx', () => ({ default: () => <div>ЭКОНОМИКА</div> }));
vi.mock('../components/player/PlayerPayments.tsx', () => ({ default: () => <div>ОПЛАТЫ</div> }));
const { default: PlayerWalletHub } = await import('../components/player/PlayerWalletHub');

// Global review 2026-10-26 (P2): a failed debt summary looked like «…» loading forever; a reload lost the open tab.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
const hub = () => render(<PlayerWalletHub data={{} as any} tokenBalance={5} onBalanceChange={() => {}} />);

describe('wallet summary and tab', () => {
  it('a failed debt summary says so and can be retried', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    hub();
    expect(await screen.findByText('Не загрузилось')).toBeTruthy();
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ summary: { historical_debt: 400 } }), { status: 200 }));
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText(/400/)).toBeTruthy();
    expect(screen.queryByText('Не загрузилось')).toBeNull();
  });

  it('the open tab is kept in the address and read back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ summary: { historical_debt: 0 } }), { status: 200 })));
    window.history.replaceState(null, '', '/player/wallet?tab=bets');
    hub();
    fireEvent.click(screen.getByRole('button', { name: /История/ }));
    expect(window.location.search).toBe('?tab=history');
    cleanup();
    hub();
    expect(screen.getByRole('button', { name: /История/ }).className).toContain('bg-white');
  });
});
