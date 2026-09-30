/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api } from '../lib/api.ts';
import { PlayersActivityCRM } from '../components/crm/PlayersActivityCRM.tsx';

vi.mock('../lib/api.ts', async () => {
  const actual = await vi.importActual<typeof import('../lib/api.ts')>('../lib/api.ts');
  return {
    ...actual,
    api: {
      ...actual.api,
      getPlayers: vi.fn(),
    },
  };
});

vi.mock('../components/crm/PlayersCRM.tsx', () => ({
  PlayersCRM: () => null,
}));

describe('PlayersActivityCRM status tabs', () => {
  beforeEach(() => {
    vi.mocked(api.getPlayers).mockResolvedValue([
      { id: 'a', nickname: 'Постоянный', game_level: 'club', club_role: 'member', contact_status: 'normal', attendance_count: 5, days_since_last_visit: 3 },
      { id: 'b', nickname: 'Редкий', game_level: 'club', attends_sometimes: 1, contact_status: 'normal', attendance_count: 0, days_since_last_visit: null },
      { id: 'c', nickname: 'Ушедший', game_level: 'club', stopped_attending: 1, contact_status: 'normal' },
      { id: 'd', nickname: 'Склеенный', game_level: 'club', source: 'legacy_guest_migrated', contact_status: 'normal' },
    ] as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('splits one list into the organizer status tabs without extra requests', async () => {
    render(<PlayersActivityCRM evenings={[]} onOpenEvening={() => undefined} />);
    await waitFor(() => expect(screen.getByText('Постоянный')).toBeTruthy());
    expect(api.getPlayers).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Редкий')).toBeNull();
    expect(screen.getByText(/ходят постоянно/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Иногда' }));
    expect(screen.getByText('Редкий')).toBeTruthy();
    expect(screen.queryByText('Постоянный')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Перестали' }));
    expect(screen.getByText('Ушедший')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Вся база' }));
    expect(screen.getByText('Склеенный')).toBeTruthy();
    expect(api.getPlayers).toHaveBeenCalledTimes(1);
  });

  it('searches the whole base whatever tab is open', async () => {
    render(<PlayersActivityCRM evenings={[]} onOpenEvening={() => undefined} />);
    await waitFor(() => expect(screen.getByText('Постоянный')).toBeTruthy());
    vi.mocked(api.getPlayers).mockResolvedValue([{ id: 'c', nickname: 'Ушедший', game_level: 'club', stopped_attending: 1, contact_status: 'normal' }] as any);
    fireEvent.change(screen.getByPlaceholderText('Ник, имя, телефон или Telegram'), { target: { value: 'Уш' } });
    await waitFor(() => expect(screen.getByText('Ушедший')).toBeTruthy());
    expect(screen.getByText(/поиск по всей базе/)).toBeTruthy();
  });
});
