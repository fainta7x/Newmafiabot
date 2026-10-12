/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerGoMafiaLink, { goMafiaIdFromInput } from '../components/player/PlayerGoMafiaLink.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('GoMafia link asks only for the ID', () => {
  it('keeps digits, and cuts the number out of a pasted link', () => {
    expect(goMafiaIdFromInput('1202')).toBe('1202');
    expect(goMafiaIdFromInput(' 12a0 2 ')).toBe('1202');
    expect(goMafiaIdFromInput('https://gomafia.pro/stats/1202')).toBe('1202');
    expect(goMafiaIdFromInput('https://gomafia.pro/stats/1202/?x=1')).toBe('1202');
    expect(goMafiaIdFromInput('gomafia.pro/stats/77')).toBe('77');
  });

  it('shows the fixed address part and sends just the number', async () => {
    const calls: Array<{ url: string; body?: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body as string | undefined });
      if (init?.method === 'PUT') return new Response(JSON.stringify({ link: { external_player_id: '1202', profile_url: 'https://gomafia.pro/stats/1202', status: 'pending', updated_at: '' } }), { status: 200 });
      return new Response(JSON.stringify({ link: null }), { status: 200 });
    }));
    render(<PlayerGoMafiaLink playerId="p1" isSelf />);
    expect(screen.getByText('gomafia.pro/stats/')).toBeDefined();
    const input = screen.getByLabelText('Твой ID на GoMafia') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://gomafia.pro/stats/1202' } });
    expect(input.value).toBe('1202');
    fireEvent.click(screen.getByText('Привязать GoMafia'));
    await screen.findByText(/Запрос отправлен организатору/);
    const put = calls.find((call) => call.body);
    expect(JSON.parse(put!.body!)).toEqual({ profile: '1202' });
  });
});
