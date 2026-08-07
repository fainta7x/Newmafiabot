/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getEvening: vi.fn(),
  getPlayers: vi.fn(),
  updateParticipant: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  api: {
    getEvening: mocks.getEvening,
    getPlayers: mocks.getPlayers,
    updateParticipant: mocks.updateParticipant,
  },
}));

vi.mock('../components/ui/PlayerAvatar', () => ({
  PlayerAvatar: () => <span data-testid="player-avatar" />,
}));

import { EveningParticipantsView } from '../components/crm/EveningParticipantsView';

const participant = {
  id: 'ep-1',
  evening_id: 'evening-1',
  player_id: 'player-1',
  table_id: null,
  nickname: 'Спящий',
  phone: null,
  telegram_username: null,
  lifecycle_status: 'regular',
  elo: 1000,
  registration_status: 'registered',
  attendance_status: 'pending',
  arrival_status: 'unknown',
  payment_status: 'unpaid',
  amount_due: 500,
  amount_paid: 0,
  notes: null,
  registered_at: null,
  confirmed_at: null,
  checked_in_at: null,
  created_at: '2026-08-07T18:00:00.000Z',
  updated_at: '2026-08-07T18:00:00.000Z',
};

const evening = {
  id: 'evening-1',
  title: 'Пятничный вечер',
  starts_at: '2026-08-07T18:00:00.000Z',
  ends_at: null,
  timezone: 'Europe/Moscow',
  venue: 'Клуб',
  format: 'STANDARD',
  status: 'active',
  capacity: 30,
  default_price: 500,
  notes: null,
  settled_at: null,
  created_at: '2026-08-01T18:00:00.000Z',
  updated_at: '2026-08-07T18:00:00.000Z',
  tables: [],
  participants: [participant],
};

describe('EveningParticipantsView participant sheet', () => {
  beforeEach(() => {
    mocks.getEvening.mockResolvedValue(evening);
    mocks.getPlayers.mockResolvedValue([]);
    mocks.updateParticipant.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
      ...participant,
      ...patch,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('responds to taps, highlights the selected state, and has no 50% shortcut', async () => {
    render(<EveningParticipantsView eveningId="evening-1" onBack={() => undefined} />);

    const playerName = await screen.findByText('Спящий');
    const playerButton = playerName.closest('button');
    expect(playerButton).toBeTruthy();
    fireEvent.click(playerButton!);

    expect(screen.getByRole('dialog', { name: 'Управление игроком Спящий' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '50%' })).toBeNull();

    const arrivedButton = screen.getByRole('button', { name: 'Пришёл' }) as HTMLButtonElement;
    fireEvent.click(arrivedButton);

    expect(mocks.updateParticipant).toHaveBeenCalledWith('ep-1', {
      attendance_status: 'attended',
      arrival_status: 'on_time',
    });
    expect(arrivedButton.className).toContain('bg-emerald-600');

    await waitFor(() => expect(arrivedButton.disabled).toBe(false));

    const paidButton = screen.getByRole('button', { name: '100%' });
    fireEvent.click(paidButton);
    expect(mocks.updateParticipant).toHaveBeenCalledWith('ep-1', {
      payment_status: 'paid',
      amount_paid: 500,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog', { name: 'Управление игроком Спящий' })).toBeNull();
  });
});
