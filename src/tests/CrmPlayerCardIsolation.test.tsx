/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api.ts';
import PlayersCRM from '../components/crm/PlayersCRM.tsx';

vi.mock('../lib/api.ts', async () => {
  const actual = await vi.importActual<typeof import('../lib/api.ts')>('../lib/api.ts');
  return { ...actual, api: { ...actual.api, getPlayers: vi.fn(), getPlayer: vi.fn() } };
});
vi.mock('../components/crm/useClubOwner.ts', () => ({ useClubOwner: () => false }));
vi.mock('../components/ui/MobileSheet.tsx', () => ({
  MobileSheet: ({ open, title, children, footer, onClose }: any) => open ? (
    <section data-testid="mock-sheet">
      <button type="button" data-testid="mock-sheet-close" onClick={onClose}>Закрыть окно</button>
      <div>{title}</div>
      <div>{children}</div>
      <div>{footer}</div>
    </section>
  ) : null,
}));
vi.mock('../components/ui/ConfirmDialog.tsx', () => ({
  ConfirmDialog: ({ open }: any) => open ? <p data-testid="avatar-delete-confirm">Удалить фото?</p> : null,
}));
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
vi.mock('../components/crm/PlayerTokenLedgerCard.tsx', () => ({
  PlayerTokenLedgerCard: ({ playerId }: any) => <p data-testid="token-sheet-open">{playerId}</p>,
}));
vi.mock('../components/player/CanonicalPremiumPlayerProfile.tsx', () => ({
  default: ({ playerId }: any) => <p data-testid="public-profile-open">{playerId}</p>,
}));

const player = (id: string, nickname: string) => ({
  id, nickname, contact_status: 'normal', source: 'manual',
  attendance_count: 1, clubGames: [], tournamentGames: [], futureBookings: [],
  activities: [], eveningHistory: [], tasks: [], avatar_updated_at: '2026-10-14T00:00:00Z',
} as any);
const props = { evenings: [], onOpenEvening: vi.fn() };

beforeEach(() => {
  vi.mocked(api.getPlayers).mockResolvedValue([player('a', 'Анна'), player('b', 'Борис')]);
  vi.mocked(api.getPlayer).mockImplementation(async (id) => player(id, id === 'a' ? 'Анна' : 'Борис'));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CRM player work card isolation', () => {
  it('ignores an older A response that completes after the selected player B', async () => {
    const pending: Record<string, (value: any) => void> = {};
    vi.mocked(api.getPlayer).mockImplementation((id) => new Promise((resolve) => { pending[id] = resolve; }));
    const { rerender } = render(<PlayersCRM {...props} selectedPlayerId="a" />);
    await waitFor(() => expect(pending.a).toBeTypeOf('function'));

    rerender(<PlayersCRM {...props} selectedPlayerId="b" />);
    await waitFor(() => expect(pending.b).toBeTypeOf('function'));
    await act(async () => { pending.b(player('b', 'Борис')); });
    expect(screen.getByText('Борис')).toBeDefined();

    await act(async () => { pending.a(player('a', 'Анна')); });
    expect(screen.getByText('Борис')).toBeDefined();
    expect(screen.queryByText('Анна')).toBeNull();
    expect(screen.getByTestId('crm-player-work-card')).toBeDefined();
  });

  it('does not reopen the previous player public profile or token sheet on another card', async () => {
    render(<PlayersCRM {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: /Анна/ }));
    await screen.findByTestId('crm-player-work-card');

    fireEvent.click(screen.getByTestId('crm-open-player-profile'));
    expect(screen.getByTestId('public-profile-open').textContent).toBe('a');
    fireEvent.click(screen.getAllByTestId('mock-sheet-close')[0]);

    fireEvent.click(screen.getByRole('button', { name: /Борис/ }));
    await screen.findByTestId('crm-player-work-card');
    expect(screen.queryByTestId('public-profile-open')).toBeNull();

    fireEvent.click(screen.getByTestId('crm-player-tokens'));
    expect(screen.getByTestId('token-sheet-open').textContent).toBe('b');
    fireEvent.click(screen.getAllByTestId('mock-sheet-close')[0]);

    fireEvent.click(screen.getByRole('button', { name: /Анна/ }));
    await screen.findByTestId('crm-player-work-card');
    expect(screen.queryByTestId('token-sheet-open')).toBeNull();
  });

  it('drops a pending response when the card closes, without reopening a ghost card', async () => {
    let resolvePlayer: ((value: any) => void) | undefined;
    vi.mocked(api.getPlayer).mockImplementationOnce(() => new Promise((resolve) => { resolvePlayer = resolve; }));
    render(<PlayersCRM {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: /Анна/ }));
    await waitFor(() => expect(resolvePlayer).toBeTypeOf('function'));

    fireEvent.click(screen.getAllByTestId('mock-sheet-close')[0]);
    await act(async () => { resolvePlayer!(player('a', 'Анна')); });
    expect(screen.queryByTestId('crm-player-work-card')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Борис/ }));
    await screen.findByTestId('crm-player-work-card');
    expect(screen.getByTestId('crm-player-work-card')).toBeDefined(); // B opened normally after A was cancelled.
  });

  it('discards the avatar-delete confirmation when switching to another player', async () => {
    const { rerender } = render(<PlayersCRM {...props} selectedPlayerId="a" />);
    await screen.findByTestId('crm-player-work-card');
    fireEvent.click(screen.getByRole('button', { name: 'Данные и фото' }));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить фото' }));
    expect(screen.getByTestId('avatar-delete-confirm')).toBeDefined();

    rerender(<PlayersCRM {...props} selectedPlayerId="b" />);
    await screen.findByTestId('crm-player-work-card');
    await waitFor(() => expect(screen.queryByTestId('avatar-delete-confirm')).toBeNull());
  });
});
