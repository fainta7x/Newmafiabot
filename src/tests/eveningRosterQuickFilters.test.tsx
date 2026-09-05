// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EveningParticipantsWorkboard from '../components/crm/EveningParticipantsWorkboard';
import { api, type EveningParticipant } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { getEvening: vi.fn(), updateParticipant: vi.fn() } }));
vi.mock('../components/ui/PlayerAvatar', () => ({ PlayerAvatar: () => null }));
vi.mock('../components/ui/MobileSheet', () => ({ MobileSheet: () => null }));

const participants = [
  { id: 'expected', player_id: '1', nickname: 'Ожидаемый', registration_status: 'going', attendance_status: 'pending', payment_status: 'unpaid', amount_due: 400, amount_paid: 0 },
  { id: 'debtor', player_id: '2', nickname: 'Пришедший', registration_status: 'going', attendance_status: 'attended', payment_status: 'partial', amount_due: 400, amount_paid: 100 },
  { id: 'paid', player_id: '3', nickname: 'Оплативший', registration_status: 'going', attendance_status: 'attended', payment_status: 'paid', amount_due: 400, amount_paid: 400 },
];

beforeEach(() => {
  vi.mocked(api.getEvening).mockResolvedValue({
    id: 'evening', title: 'Тестовый вечер', starts_at: '2020-01-01T17:00:00Z',
    status: 'active', participants,
  } as unknown as Awaited<ReturnType<typeof api.getEvening>>);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function openRoster() {
  render(<EveningParticipantsWorkboard eveningId="evening" onBack={() => {}} onAddPlayer={() => {}} />);
  await screen.findByTestId('evening-roster-list');
}

describe('Evening roster quick filters', () => {
  it('finds paid players outside the selected queue and restores the queue after clearing', async () => {
    await openRoster();
    fireEvent.click(screen.getByRole('button', { name: 'Оплата 1' }));
    expect(screen.queryByTestId('evening-roster-row-expected')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Найти игрока в составе вечера' }), { target: { value: '  ОПЛАТИВШИЙ ' } });
    expect(screen.getByTestId('evening-roster-row-paid')).toBeTruthy();
    expect(screen.queryByTestId('evening-roster-row-debtor')).toBeNull();
    expect(screen.getByRole('button', { name: 'Оплата 1' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Очистить поиск' }));
    expect(screen.getByTestId('evening-roster-row-debtor')).toBeTruthy();
    expect(screen.queryByTestId('evening-roster-row-paid')).toBeNull();
    expect(screen.getByRole('button', { name: 'Оплата 1' }).getAttribute('aria-pressed')).toBe('true');
    expect(api.updateParticipant).not.toHaveBeenCalled();
  });

  it('switches directly from search to attendance without changing player data', async () => {
    await openRoster();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'нет такого' } });
    expect(screen.getByText('Игрок не найден в составе этого вечера.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Явка 1' }));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('evening-roster-row-expected')).toBeTruthy();
    expect(screen.queryByTestId('evening-roster-row-debtor')).toBeNull();
    expect(api.updateParticipant).not.toHaveBeenCalled();
  });

  it('keeps the payment queue selected when its last payment is recorded', async () => {
    await openRoster();
    vi.mocked(api.updateParticipant).mockResolvedValue({ ...participants[1], payment_status: 'paid', amount_paid: 400 } as EveningParticipant);
    fireEvent.click(screen.getByRole('button', { name: 'Оплата 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Принять 300 ₽' }));
    await waitFor(() => expect(api.updateParticipant).toHaveBeenCalledWith('debtor', { amount_paid: 400, payment_status: 'paid' }));
    expect(screen.getByText('У пришедших игроков нет ожидающих оплат.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Оплата 0' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('evening-roster-row-expected')).toBeNull();
  });
});
