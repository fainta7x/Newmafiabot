/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api.ts';
import { PlayersActivityCRM } from '../components/crm/PlayersActivityCRM.tsx';

vi.mock('../lib/api.ts', async () => {
  const actual = await vi.importActual<typeof import('../lib/api.ts')>('../lib/api.ts');
  return { ...actual, api: { ...actual.api, getPlayers: vi.fn() } };
});
vi.mock('../components/crm/PlayersCRM.tsx', () => ({ PlayersCRM: () => null }));

const person = {
  id: 'person-a', nickname: 'Марина', full_name: 'Марина Н.',
  club_role: 'member', game_level: 'club', source: 'manual',
  contact_status: 'normal', stopped_attending: 0, attends_sometimes: 0,
  days_since_last_visit: 3, attendance_count: 5,
} as any;

const profileSummary = {
  players: [{ id: 'person-a', profile_completeness: {
    percentage: 64, complete: false, missing_fields: ['avatar'],
    fields: { avatar: { label: 'Аватар', state: 'missing' } },
  } }],
};
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});

const filterByAvatar = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }));
  fireEvent.change(screen.getByLabelText('Заполненность профиля'), { target: { value: 'missing_avatar' } });
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
};

describe('CRM player profile filter data availability', () => {
  beforeEach(() => vi.mocked(api.getPlayers).mockResolvedValue([person]));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('never claims that no players match when profile summary request failed, then allows retry', async () => {
    let attempts = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('profile-integrity/summary')) {
        attempts += 1;
        return Promise.resolve(attempts === 1 ? response({ error: 'temporary' }, 503) : response(profileSummary));
      }
      return Promise.resolve(response({ birthdays: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<PlayersActivityCRM evenings={[]} onOpenEvening={() => undefined} />);
    await filterByAvatar();

    const warning = await screen.findByTestId('crm-profile-filter-unavailable');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Не удалось проверить'));
    expect(warning.textContent).toContain('не означает, что подходящих игроков нет');
    expect(screen.queryByText('Здесь пока никого')).toBeNull();
    expect(screen.queryByText(/0 человек/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Повторить проверку' }));
    await waitFor(() => expect(screen.getByText('Марина')).toBeDefined());
    expect(screen.queryByTestId('crm-profile-filter-unavailable')).toBeNull();
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it('keeps a valid profile filter usable even if the optional birthdays endpoint fails', async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(
      url.includes('profile-integrity/summary') ? response(profileSummary) : response({ error: 'unavailable' }, 503),
    ));
    vi.stubGlobal('fetch', fetchMock);
    render(<PlayersActivityCRM evenings={[]} onOpenEvening={() => undefined} />);
    await filterByAvatar();
    await waitFor(() => expect(screen.getByText('Марина')).toBeDefined());
    expect(screen.queryByTestId('crm-profile-filter-unavailable')).toBeNull();
  });
});
