/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerInviteSettings from '../components/player/PlayerInviteSettings.tsx';
import DirectContactButtons from '../components/player/DirectContactButtons.tsx';

const kinds = [{ kind: 'NOVICE', label: 'Вечера для новичков' }, { kind: 'POKER', label: 'Покер за столом' }];

describe('«Приглашения» in the player settings', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('shows every kind switched on and saves a switched-off one', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: any) => {
      if (init?.method === 'PUT') { calls.push(JSON.parse(init.body)); return new Response(JSON.stringify({ blocked_kinds: ['POKER'], allow_direct_contact: false, kinds }), { status: 200 }); }
      return new Response(JSON.stringify({ blocked_kinds: [], allow_direct_contact: false, kinds }), { status: 200 });
    }));
    render(<PlayerInviteSettings />);
    const poker = await screen.findByLabelText('Покер за столом') as HTMLInputElement;
    expect(poker.checked).toBe(true);
    fireEvent.click(poker);
    await waitFor(() => expect(calls).toEqual([{ blocked_kinds: ['POKER'] }]));
    await waitFor(() => expect((screen.getByLabelText('Покер за столом') as HTMLInputElement).checked).toBe(false));
  });
});

describe('«Написать лично»', () => {
  afterEach(cleanup);

  it('shows nothing without a contact and copies the text before opening the dialog', async () => {
    const { container } = render(<DirectContactButtons contact={null} text="привет" />);
    expect(container.textContent).toBe('');
    cleanup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<DirectContactButtons contact={{ vk_url: 'https://vk.com/im?sel=7', telegram_url: null }} text="Зову на вечер" />);
    fireEvent.click(screen.getByText('ВК'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://vk.com/im?sel=7', '_blank', 'noopener,noreferrer'));
    expect(writeText).toHaveBeenCalledWith('Зову на вечер');
    expect(await screen.findByText(/Текст скопирован/)).toBeTruthy();
  });
});
