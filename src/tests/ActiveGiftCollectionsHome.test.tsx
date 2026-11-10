/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActiveGiftCollectionsHome from '../components/crm/ActiveGiftCollectionsHome.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('«Активные сборы на подарки» on the CRM home', () => {
  it('shows nothing — not even a loading line — while there are no collections', async () => {
    let release: (value: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const { container } = render(<ActiveGiftCollectionsHome />);
    expect(container.querySelector('[data-testid="crm-active-gift-collections"]')).toBeNull();
    release(new Response(JSON.stringify([]), { status: 200 }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await Promise.resolve();
    expect(container.querySelector('[data-testid="crm-active-gift-collections"]')).toBeNull();
    expect(screen.queryByText(/Загружаем сборы/)).toBeNull();
  });
  it('shows an open collection once it is loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(String(url).endsWith('/api/gift-collections') ? [{ id: 'g1', honoree_nickname: 'Алоэ', status: 'open' }] : { contributions: [{ status: 'invited', pledged_amount: 0, paid_amount: 0 }] }), { status: 200 })));
    render(<ActiveGiftCollectionsHome />);
    expect(await screen.findByText('Подарок: Алоэ')).toBeDefined();
  });
});
