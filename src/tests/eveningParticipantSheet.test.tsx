/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ getEvening: vi.fn(), getPlayers: vi.fn(), updateParticipant: vi.fn() }));
vi.mock('../lib/api', () => ({ api: { getEvening: mocks.getEvening, getPlayers: mocks.getPlayers, updateParticipant: mocks.updateParticipant } }));
vi.mock('../components/ui/PlayerAvatar', () => ({ PlayerAvatar: () => <span data-testid="player-avatar" /> }));
import { EveningParticipantsView } from '../components/crm/EveningParticipantsView';

const participant = { id: 'ep-1', evening_id: 'evening-1', player_id: 'player-1', table_id: null, nickname: 'Спящий', phone: null, telegram_username: null, lifecycle_status: 'regular', elo: 1000, registration_status: 'going', attendance_status: 'pending', arrival_status: 'unknown', payment_status: 'unpaid', amount_due: 500, amount_paid: 0, notes: null, registered_at: null, confirmed_at: null, checked_in_at: null, created_at: '2026-08-07T18:00:00.000Z', updated_at: '2026-08-07T18:00:00.000Z' };
const evening = { id: 'evening-1', title: 'Пятничный вечер', starts_at: '2026-08-07T18:00:00.000Z', ends_at: null, timezone: 'Europe/Moscow', venue: 'Клуб', format: 'STANDARD', status: 'active', capacity: 1, default_price: 500, notes: null, settled_at: null, created_at: '2026-08-01T18:00:00.000Z', updated_at: '2026-08-07T18:00:00.000Z', tables: [], participants: [participant] };

describe('EveningParticipantsView response/attendance/payment model', () => {
  beforeEach(() => {
    mocks.getEvening.mockResolvedValue(evening);
    mocks.getPlayers.mockResolvedValue([]);
    mocks.updateParticipant.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({ ...participant, ...patch }));
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('opens profile in one tap and keeps attendance/payment independent from response', async () => {
    const onOpenPlayerCard = vi.fn();
    render(<EveningParticipantsView eveningId="evening-1" onBack={() => undefined} onOpenPlayerCard={onOpenPlayerCard} />);
    expect((await screen.findAllByText('Иду')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Резерв')).toBeNull();
    expect(screen.queryByText('Свободно')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Подтвердить' })).toBeNull();

    const sleeperLabels = screen.getAllByText('Спящий');
    fireEvent.click(sleeperLabels[0]);
    expect(onOpenPlayerCard).toHaveBeenCalledWith('player-1');

    fireEvent.click(screen.getByRole('button', { name: 'Пришёл' }));
    await waitFor(() => expect(mocks.updateParticipant).toHaveBeenCalledWith('ep-1', { attendance_status: 'attended' }));

    fireEvent.click(screen.getByRole('button', { name: 'Действия Спящий' }));
    expect(await screen.findByText('Ответ на вечер')).toBeTruthy();
    expect(screen.queryByText('Стол')).toBeNull();
  });
});