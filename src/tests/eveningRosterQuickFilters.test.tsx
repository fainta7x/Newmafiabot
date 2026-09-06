// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EveningActiveRosterView from '../components/crm/EveningActiveRosterView';
import EveningPaymentsPanel from '../components/crm/EveningPaymentsPanel';
import { api, type EveningParticipant } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { getEvening: vi.fn(), getPlayers: vi.fn(), updateParticipant: vi.fn() } }));
vi.mock('../components/ui/PlayerAvatar', () => ({ PlayerAvatar: () => null }));
vi.mock('../components/ui/MobileSheet', () => ({ MobileSheet: () => null }));

const participants = [
  { id: 'expected', player_id: '1', nickname: 'Ожидаемый', registration_status: 'going', attendance_status: 'pending', payment_status: 'unpaid', amount_due: 400, amount_paid: 0 },
  { id: 'debtor', player_id: '2', nickname: 'Пришедший', registration_status: 'going', attendance_status: 'attended', payment_status: 'partial', amount_due: 400, amount_paid: 100 },
  { id: 'paid', player_id: '3', nickname: 'Оплативший', registration_status: 'going', attendance_status: 'attended', payment_status: 'paid', amount_due: 400, amount_paid: 400 },
  { id: 'thinking', player_id: '4', nickname: 'Думающий', registration_status: 'thinking', attendance_status: 'pending', payment_status: 'unpaid', amount_due: 400, amount_paid: 0 },
];

beforeEach(() => {
  vi.mocked(api.getEvening).mockResolvedValue({
    id: 'evening', title: 'Тестовый вечер', starts_at: '2020-01-01T17:00:00Z',
    status: 'active', participants,
  } as unknown as Awaited<ReturnType<typeof api.getEvening>>);
  vi.mocked(api.getPlayers).mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('Mounted evening lists', () => {
  it('searches across roster filters while preserving the confirmed-only scope', async () => {
    render(<EveningActiveRosterView eveningId="evening" />);
    await screen.findByText('Ожидаемый');
    fireEvent.click(screen.getByRole('button', { name: '1 Ожидаем' }));
    expect(screen.queryByText('Оплативший')).toBeNull();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: ' ОПЛАТИВШИЙ ' } });
    expect(screen.getByText('Оплативший')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Очистить поиск' }));
    expect(screen.getByText('Ожидаемый')).toBeTruthy();
    expect(screen.queryByText('Оплативший')).toBeNull();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Думающий' } });
    expect(screen.getByText('Участник не найден в составе вечера.')).toBeTruthy();
    expect(api.updateParticipant).not.toHaveBeenCalled();
  });

  it('keeps the expected queue selected after recording the last arrival', async () => {
    render(<EveningActiveRosterView eveningId="evening" />);
    await screen.findByText('Ожидаемый');
    vi.mocked(api.updateParticipant).mockResolvedValue({ ...participants[0], attendance_status: 'attended' } as EveningParticipant);
    fireEvent.click(screen.getByRole('button', { name: '1 Ожидаем' }));
    fireEvent.click(screen.getByRole('button', { name: 'Пришёл' }));
    await waitFor(() => expect(api.updateParticipant).toHaveBeenCalledWith('expected', { attendance_status: 'attended' }));
    expect(screen.getByText('Все участники уже пришли.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '0 Ожидаем' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('finds a paid player from the debt filter and rolls back a failed payment', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      evening: { id: 'evening', closed: true },
      participants: participants.slice(1, 3),
    }))).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Не сохранено' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<EveningPaymentsPanel eveningId="evening" />);
    await screen.findByText('Пришедший');
    fireEvent.click(screen.getByRole('button', { name: '1 Не оплатили' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Оплативший' } });
    expect(screen.getByText('Оплативший')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Очистить поиск' }));
    expect(screen.queryByText('Оплативший')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Не оплатил' }));
    await screen.findByText('Не сохранено');
    expect(screen.getByText('Пришедший')).toBeTruthy();
    expect(screen.getByRole('button', { name: '1 Не оплатили' }).getAttribute('aria-pressed')).toBe('true');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/evenings/evening/payments/debtor', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ paid: true }) }));
  });
});
