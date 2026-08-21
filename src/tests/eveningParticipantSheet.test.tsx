/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../components/crm/EveningGameRegistrationDashboard', () => ({
  default: () => <div data-testid="game-registration-dashboard">Ответы и игры</div>,
}));
vi.mock('../components/crm/EveningInviteAudienceManager', () => ({
  default: () => <div data-testid="invite-audience-manager">База рассылки</div>,
}));

import { EveningParticipantsView } from '../components/crm/EveningParticipantsView';

describe('EveningParticipantsView invitation flow', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

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
