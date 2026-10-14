// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import TelegramLinkRedeem, { hasTelegramLinkCode } from '../components/player/TelegramLinkRedeem.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

describe('«Подтвердить через ВК» landing', () => {
  it('redeems the code from the address, shows the result and removes the code from the address bar', async () => {
    window.history.replaceState({}, '', '/player?tglink=abcdefghijklmnopqrstuv&x=1');
    expect(hasTelegramLinkCode()).toBe(true);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: true, nickname: 'Атеист с ножом' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    render(<TelegramLinkRedeem />);
    expect((await screen.findByTestId('telegram-link-result')).textContent).toContain('Telegram привязан к профилю «Атеист с ножом»');
    expect(JSON.parse(String((fetcher.mock.calls[0] as any)[1].body))).toEqual({ code: 'abcdefghijklmnopqrstuv' });
    await waitFor(() => expect(window.location.search).toBe('?x=1'));
  });

  it('shows the server\'s reason when the link cannot be used, and does nothing without a code', async () => {
    window.history.replaceState({}, '', '/player?tglink=abcdefghijklmnopqrstuv');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Ссылка устарела.' }), { status: 410, headers: { 'Content-Type': 'application/json' } })));
    render(<TelegramLinkRedeem />);
    expect((await screen.findByTestId('telegram-link-result')).textContent).toContain('Ссылка устарела.');
    cleanup();
    window.history.replaceState({}, '', '/player');
    const quiet = vi.fn();
    vi.stubGlobal('fetch', quiet);
    render(<TelegramLinkRedeem />);
    expect(quiet).not.toHaveBeenCalled();
  });
});
