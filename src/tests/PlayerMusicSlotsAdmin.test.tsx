/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerMusicSlotsAdmin from '../components/crm/PlayerMusicSlotsAdmin.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

describe('PlayerMusicSlotsAdmin', () => {
  it('fixes a link and frees a slot only after a second tap', async () => {
    const calls: Array<{ method: string; url: string; body: any }> = [];
    const slots = { slots: [
      { slot: 1, entry: { id: 'a', title: 'Старый трек', source_url: 'https://music.yandex.ru/album/1/track/1' } },
      { slot: 2, entry: { id: 'b', title: 'Ночь', source_url: 'https://music.yandex.ru/album/1/track/2' } },
    ] };
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ method: init?.method || 'GET', url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      return json(init?.method === 'PUT' ? { entry: {} } : init?.method === 'DELETE' ? { ok: true } : slots);
    }));
    render(<PlayerMusicSlotsAdmin playerId="p1" />);

    const input = await screen.findByLabelText('Музыка для раздачи: ссылка');
    fireEvent.change(input, { target: { value: 'https://music.yandex.ru/album/9/track/9' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Исправить ссылку' })[0]);
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
    expect(calls.find((call) => call.method === 'PUT')).toMatchObject({
      url: '/api/player/music-library/admin/player-slots/p1/1',
      body: { url: 'https://music.yandex.ru/album/9/track/9' },
    });

    fireEvent.click((await screen.findAllByRole('button', { name: 'Освободить слот' }))[1]);
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Точно освободить' }));
    await waitFor(() => expect(calls.find((call) => call.method === 'DELETE')?.url).toBe('/api/player/music-library/admin/player-slots/p1/2'));
  });
});
