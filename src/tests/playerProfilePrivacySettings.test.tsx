/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerProfilePrivacySettings from '../components/player/PlayerProfilePrivacySettings.tsx';

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const visibility = { real_name: false, birthday_day_month: false, birth_year: false, telegram_username: false, phone: false, game_statistics: true, connections: true };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PlayerProfilePrivacySettings', () => {
  it('says so when the settings cannot be loaded instead of loading for ever', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json({ error: 'Нет доступа' }, 500)));
    render(<PlayerProfilePrivacySettings />);
    expect(await screen.findByText('Нет доступа')).toBeDefined();
    expect(screen.queryByText('Загрузка приватности…')).toBeNull();
  });

  it('puts the switch back when saving fails', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: RequestInfo | URL, init?: RequestInit) => (init?.method === 'PATCH' ? json({ error: 'Не удалось сохранить' }, 500) : json({ visibility }))));
    render(<PlayerProfilePrivacySettings />);
    const phone = (await screen.findByText('Телефон')).closest('label')!.querySelector('input')!;
    expect(phone.checked).toBe(false);
    fireEvent.click(phone);
    expect(await screen.findByText('Не удалось сохранить')).toBeDefined();
    await waitFor(() => expect(phone.checked).toBe(false));
  });
});
