// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EveningActiveRosterView from '../components/crm/EveningActiveRosterView';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { getEvening: vi.fn(), getPlayers: vi.fn(), createPlayer: vi.fn(), updateParticipant: vi.fn() } }));
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
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    render(<EveningActiveRosterView eveningId="evening" initialAddOpen />);
    fireEvent.click(await screen.findByTestId('roster-add-mode-new'));
    fireEvent.change(screen.getByPlaceholderText('Никнейм *'), { target: { value: ' Новичок ' } });
    fireEvent.change(screen.getByPlaceholderText('Telegram — необязательно'), { target: { value: '@nov' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать профиль и добавить' }));
    await waitFor(() => expect(api.createPlayer).toHaveBeenCalledWith(expect.objectContaining({ nickname: 'Новичок', telegram_username: 'nov', source: 'manual' })));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes('/participants/bulk') && String(init?.body).includes('new-1'))).toBe(true));
  });
});
