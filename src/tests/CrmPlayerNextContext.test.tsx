/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api.ts';
import PlayersCRM from '../components/crm/PlayersCRM.tsx';

vi.mock('../lib/api.ts', async () => {
  const actual = await vi.importActual<typeof import('../lib/api.ts')>('../lib/api.ts');
  return { ...actual, api: { ...actual.api, getPlayer: vi.fn(), getPlayers: vi.fn() } };
});
vi.mock('../components/crm/useClubOwner.ts', () => ({ useClubOwner: () => false }));
vi.mock('../components/ui/MobileSheet.tsx', () => ({
  MobileSheet: ({ open, title, children }: any) => open
    ? <section><h2>{title}</h2>{children}</section> : null,
}));
vi.mock('../components/ui/ConfirmDialog.tsx', () => ({ ConfirmDialog: () => null }));
vi.mock('../components/ui/PlayerAvatar.tsx', () => ({ PlayerAvatar: () => null }));
vi.mock('../components/crm/PlayerAccessSettings.tsx', () => ({ PlayerAccessSettings: () => null }));
vi.mock('../components/player/PlayerGoMafiaLink.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/PlayerAccountLinks.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/PlayerActivityCard.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/PlayerProfileIntegrityPanel.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/PlayerServiceTools.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/PlayerGameCard.tsx', () => ({ PlayerGameCard: () => null }));
vi.mock('../components/player/StaffWorkStats.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/LearningProgressCRM.tsx', () => ({ PlayerLearningBlock: () => null }));
vi.mock('../components/crm/PlayerMusicSlotsAdmin.tsx', () => ({ default: () => null }));
vi.mock('../components/crm/PlayerTokenLedgerCard.tsx', () => ({ PlayerTokenLedgerCard: () => null }));
vi.mock('../components/player/CanonicalPremiumPlayerProfile.tsx', () => ({ default: () => null }));

const nextTask = { id: 't1', title: 'Написать о времени начала', due_at: '2027-11-01T12:00:00Z', status: 'open' };
const upcomingEvening = { id: 'evening1', title: 'Пятничная мафия', starts_at: '2027-11-03T18:00:00Z', status: 'published' } as any;

const player = (withEvening: boolean, withTask: boolean) => ({
  id: 'a', nickname: 'Аня', contact_status: 'normal', source: 'manual',
  futureBookings: withEvening ? [{ evening_id: 'evening1', response_status: 'going' }] : [],
  nextTask: withTask ? nextTask : null,
  activities: [], tasks: [], eveningHistory: [], clubGames: [], tournamentGames: [],
} as any);

beforeEach(() => { vi.mocked(api.getPlayers).mockResolvedValue([]); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('CRM player work-card next context', () => {
  it('shows both nearest booked evening and pending follow-up task, and preserves the evening action', async () => {
    const onOpenEvening = vi.fn();
    vi.mocked(api.getPlayer).mockResolvedValue(player(true, true));
    render(<PlayersCRM evenings={[upcomingEvening]} selectedPlayerId="a" onOpenEvening={onOpenEvening} />);

    const context = await screen.findByTestId('crm-player-next');
    expect(context.textContent).toContain('Следующий вечер');
    expect(context.textContent).toContain('Пятничная мафия');
    expect(context.textContent).toContain('Иду');
    expect(context.textContent).toContain('Ближайшая задача');
    expect(context.textContent).toContain(nextTask.title);
    fireEvent.click(screen.getByRole('button', { name: 'Пятничная мафия' }));
    expect(onOpenEvening).toHaveBeenCalledExactlyOnceWith('evening1');
  });

  it('shows only a booking when there is no pending task', async () => {
    vi.mocked(api.getPlayer).mockResolvedValue(player(true, false));
    render(<PlayersCRM evenings={[upcomingEvening]} selectedPlayerId="a" onOpenEvening={vi.fn()} />);
    const context = await screen.findByTestId('crm-player-next');
    expect(context.textContent).toContain('Следующий вечер');
    expect(context.textContent).not.toContain('Ближайшая задача');
  });

  it('shows only the pending task when there is no upcoming booking', async () => {
    vi.mocked(api.getPlayer).mockResolvedValue(player(false, true));
    render(<PlayersCRM evenings={[upcomingEvening]} selectedPlayerId="a" onOpenEvening={vi.fn()} />);
    const context = await screen.findByTestId('crm-player-next');
    expect(context.textContent).not.toContain('Следующий вечер');
    expect(context.textContent).toContain(nextTask.title);
  });

  it('does not add an empty information block with neither upcoming evening nor task', async () => {
    vi.mocked(api.getPlayer).mockResolvedValue(player(false, false));
    render(<PlayersCRM evenings={[upcomingEvening]} selectedPlayerId="a" onOpenEvening={vi.fn()} />);
    await screen.findByTestId('crm-player-work-card');
    expect(screen.queryByTestId('crm-player-next')).toBeNull();
  });
});
