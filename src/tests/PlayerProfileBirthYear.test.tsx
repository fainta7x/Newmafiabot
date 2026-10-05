/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerProfileSettings from '../components/player/PlayerProfileSettings.tsx';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('birth year in the profile settings', () => {
  const setup = (settings: Record<string, unknown>) => {
    const saved: any[] = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/profile-settings')) return json({ player: settings });
      if (init?.method === 'PATCH') { saved.push(JSON.parse(String(init.body))); return json({ player: {} }); }
      return json({});
    }));
    const player: any = { id: 'me', nickname: 'Я', full_name: null, phone: null, telegram_username: null };
    const { container } = render(<PlayerProfileSettings player={player} onPlayerChange={() => {}} />);
    return { saved, input: container.querySelector('input[type="date"]') as HTMLInputElement };
  };
  const save = async (saved: any[]) => { fireEvent.click(screen.getByTestId('profile-save')); await waitFor(() => expect(saved).toHaveLength(1)); return saved[0]; };

  it('keeps a year of 2000 that the player picks for a fresh date', async () => {
    const { saved, input } = setup({});
    fireEvent.change(input, { target: { value: '2000-05-17' } });
    expect(await save(saved)).toMatchObject({ birth_day: 17, birth_month: 5, birth_year: 2000 });
  });

  it('still treats the placeholder year as «no year» when only the day changes', async () => {
    const { saved, input } = setup({ birth_day: 17, birth_month: 5, birth_year: null });
    await waitFor(() => expect(input.value).toBe('2000-05-17'));
    fireEvent.change(input, { target: { value: '2000-05-18' } });
    expect(await save(saved)).toMatchObject({ birth_day: 18, birth_month: 5, birth_year: null });
  });
});
