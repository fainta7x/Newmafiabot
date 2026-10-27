/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlayerInviteSettings from '../components/player/PlayerInviteSettings.tsx';
import PlayerNotificationSettings from '../components/player/PlayerNotificationSettings.tsx';
import PlayerProfilePrivacySettings from '../components/player/PlayerProfilePrivacySettings.tsx';

const visibility = { real_name: false, birthday_day_month: false, birth_year: false, telegram_username: false, phone: false, game_statistics: true, connections: true };
const invitations = { blocked_kinds: [], allow_direct_contact: false, kinds: [{ kind: 'POKER', label: 'Покер' }] };
const notifications = { preferred_channel: 'auto', personal_enabled: true, available_channels: ['telegram'], effective_channel: 'telegram', channel_status: { telegram: { linked: true, available: true }, vk: { linked: true, available: true } } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('player settings: recover without reloading and show confirmed saves', () => {
  for (const [name, Component, body, ready] of [
    ['приглашения', PlayerInviteSettings, invitations, 'Друзья могут написать мне лично'],
    ['уведомления', PlayerNotificationSettings, notifications, 'Получать личные уведомления'],
    ['приватность', PlayerProfilePrivacySettings, { visibility }, 'Телефон'],
  ] as const) {
    it(`retries ${name} after an initial connection failure`, async () => {
      const fetchSettings = vi.fn().mockResolvedValueOnce(json({ error: 'Нет связи' }, 503)).mockResolvedValueOnce(json(body));
      vi.stubGlobal('fetch', fetchSettings);
      render(<Component />);
      expect((await screen.findByRole('alert')).textContent).toContain('Нет связи');
      fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
      await screen.findByLabelText(ready);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(fetchSettings).toHaveBeenCalledTimes(2);
      expect(fetchSettings.mock.calls.every(([, init]) => !init?.method)).toBe(true);
    });
  }

  it('serializes privacy edits and uses the canonical successful visibility in the next save', async () => {
    let complete!: (response: Response) => void;
    const patches: any[] = [];
    vi.stubGlobal('fetch', vi.fn((_url, init?: RequestInit) => {
      if (init?.method !== 'PATCH') return Promise.resolve(json({ visibility }));
      patches.push(JSON.parse(String(init.body)).visibility);
      if (patches.length === 1) return new Promise<Response>((resolve) => { complete = resolve; });
      return Promise.resolve(json({ visibility: patches.at(-1) }));
    }));
    render(<PlayerProfilePrivacySettings />);
    const phone = await screen.findByLabelText('Телефон') as HTMLInputElement;
    const realName = screen.getByLabelText('Настоящее имя') as HTMLInputElement;
    fireEvent.click(phone);
    expect(phone.disabled).toBe(true);
    expect(realName.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Сохранение');
    fireEvent.click(realName);
    expect(patches).toHaveLength(1);
    complete(json({ visibility }));
    await waitFor(() => expect(phone.disabled).toBe(false));
    expect(phone.checked).toBe(false);
    fireEvent.click(realName);
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]).toMatchObject({ real_name: true, phone: false });
    await screen.findByText('Сохранено');
  });

  it('shows pending and confirmed invitation saves, and retains confirmed choices on failure', async () => {
    let complete!: (response: Response) => void;
    let writes = 0;
    vi.stubGlobal('fetch', vi.fn((_url, init?: RequestInit) => {
      if (init?.method !== 'PUT') return Promise.resolve(json(invitations));
      if (++writes === 1) return new Promise<Response>((resolve) => { complete = resolve; });
      return Promise.resolve(json({ error: 'Не сохранилось' }, 503));
    }));
    render(<PlayerInviteSettings />);
    const poker = await screen.findByLabelText('Покер') as HTMLInputElement;
    fireEvent.click(poker);
    expect(poker.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Сохраняем');
    complete(json({ ...invitations, blocked_kinds: ['POKER'] }));
    await screen.findByText('Настройки приглашений сохранены');
    expect(poker.checked).toBe(false);
    fireEvent.click(poker);
    expect((await screen.findByRole('alert')).textContent).toContain('Не сохранилось');
    expect(poker.checked).toBe(false);
    expect(screen.queryByText('Настройки приглашений сохранены')).toBeNull();
  });
});
