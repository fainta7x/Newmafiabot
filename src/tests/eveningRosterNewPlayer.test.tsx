// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EveningActiveRosterView from '../components/crm/EveningActiveRosterView';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { getEvening: vi.fn(), getPlayers: vi.fn(), createPlayer: vi.fn(), updateParticipant: vi.fn(), bulkUpdateParticipants: vi.fn() } }));
vi.mock('../components/ui/PlayerAvatar', () => ({ PlayerAvatar: () => null }));
vi.mock('../components/ui/MobileSheet', () => ({
  MobileSheet: ({ open, children, footer }: any) => (open ? <div>{children}{footer}</div> : null),
}));

beforeEach(() => {
  vi.mocked(api.getEvening).mockResolvedValue({
    id: 'evening', title: 'Вечер', starts_at: '2020-01-01T17:00:00Z', status: 'active', default_price: 400, participants: [],
  } as any);
  vi.mocked(api.getPlayers).mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('judge registers a player profile from the evening roster', () => {
  it('creates a real profile and adds it to the evening', async () => {
    vi.mocked(api.createPlayer).mockResolvedValue({ id: 'new-1', nickname: 'Новичок' } as any);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ participants: [{ id: 'ep-new', player_id: 'new-1' }] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<EveningActiveRosterView eveningId="evening" initialAddOpen />);
    fireEvent.click(await screen.findByTestId('roster-add-mode-new'));
    fireEvent.change(screen.getByPlaceholderText('Никнейм *'), { target: { value: ' Новичок ' } });
    fireEvent.change(screen.getByPlaceholderText('Telegram — необязательно'), { target: { value: '@nov' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать профиль и добавить' }));
    await waitFor(() => expect(api.createPlayer).toHaveBeenCalledWith(expect.objectContaining({ nickname: 'Новичок', telegram_username: 'nov', source: 'manual' })));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/participants/bulk') && String(init?.body).includes('new-1'))).toBe(true));
    // He is there: the attendance is set, the answer is not touched.
    await waitFor(() => expect(api.bulkUpdateParticipants).toHaveBeenCalledWith('evening', [{ id: 'ep-new', attendance_fact: 'attended_on_time' }]));
  });

  it('a player who had declined and is added back keeps his answer and is marked as arrived (no rollback)', async () => {
    vi.mocked(api.getEvening).mockResolvedValue({
      id: 'evening', title: 'Вечер', starts_at: '2020-01-01T17:00:00Z', status: 'active', default_price: 400,
      participants: [{ id: 'ep-1', player_id: 'p-1', nickname: 'Отказавшийся', response_status: 'declined', registration_status: 'declined', attendance_status: 'pending' }],
    } as any);
    vi.mocked(api.getPlayers).mockResolvedValue([{ id: 'p-1', nickname: 'Отказавшийся' }] as any);
    render(<EveningActiveRosterView eveningId="evening" initialAddOpen />);
    fireEvent.click(await screen.findByRole('button', { name: /Отказавшийся/ }));
    fireEvent.click(screen.getByRole('button', { name: /Добавить в состав/ }));
    await waitFor(() => expect(api.bulkUpdateParticipants).toHaveBeenCalledWith('evening', [{ id: 'ep-1', attendance_fact: 'attended_on_time' }]));
  });
});
