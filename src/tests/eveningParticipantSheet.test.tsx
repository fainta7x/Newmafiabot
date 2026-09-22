/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../components/crm/EveningGameRegistrationDashboard', () => ({
  default: () => <div data-testid="game-registration-dashboard">Ответы и игры</div>,
}));
vi.mock('../lib/api.ts', () => ({
  api: {
    getEvening: vi.fn().mockResolvedValue({
      id: 'evening-1',
      title: 'Пятничная игра',
      starts_at: '2026-09-25T19:00:00.000Z',
      status: 'published',
      venue: 'Клуб',
    }),
  },
}));

vi.mock('../components/crm/EveningInviteAudienceManager', () => ({
  default: () => <div data-testid="invite-audience-manager">База рассылки</div>,
}));

import { EveningParticipantsView } from '../components/crm/EveningParticipantsView';
import { EveningOverviewView } from '../components/crm/EveningOverviewView';

describe('EveningParticipantsView invitation flow', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('opens the organizer next-step sections from the evening overview', async () => {
    const onOpenSection = vi.fn();
    render(<EveningOverviewView eveningId="evening-1" onBack={() => undefined} onOpenSection={onOpenSection} />);

    expect(await screen.findByText('Следующие шаги')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ответы участников' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сам вечер' }));
    fireEvent.click(screen.getByRole('button', { name: 'Игры' }));

    expect(onOpenSection.mock.calls).toEqual([['participants'], ['management'], ['games']]);
  });

  it('keeps invitations focused on answers and game choices', () => {
    render(<EveningParticipantsView eveningId="evening-1" onBack={() => undefined} />);

    expect(screen.getByText('Кого пригласил')).toBeTruthy();
    expect(screen.getByTestId('game-registration-dashboard')).toBeTruthy();
    expect(screen.queryByText('База рассылки')).toBeNull();
    expect(screen.queryByText('Явка не отмечена')).toBeNull();
    expect(screen.queryByText('Оплачено')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Кого звать на вечер/ }));
    expect(screen.getByTestId('invite-audience-manager')).toBeTruthy();
  });
});
