// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NoviceDevelopmentCRM } from '../components/crm/NoviceDevelopmentCRM.tsx';

const application = (overrides: Record<string, unknown>) => ({
  id: 'a1', player_id: 'p1', nickname: 'Лиса', entry_route: 'NOVICE', status: 'COMPLETED', notes: null,
  organizer_notes: null, evening_title: null, evening_starts_at: null, game_level: 'novice', club_stage: 'NOVICE_ACTIVE',
  novice_visits: 2, created_at: '2026-09-01T10:00:00Z', ...overrides,
});

const mockApplications = (items: unknown[]) => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ applications: items, awaiting_players: [] }) })));
};

describe('NoviceDevelopmentCRM level hint', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('warns that a novice-level player cannot book regular evenings and opens the player card', async () => {
    mockApplications([application({})]);
    const onOpenPlayer = vi.fn();
    render(<NoviceDevelopmentCRM onOpenPlayer={onOpenPlayer} />);
    await waitFor(() => expect(screen.getByText(/после перевода на обычные вечера/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Открыть карточку игрока' }));
    expect(onOpenPlayer).toHaveBeenCalledWith('p1');
  });

  it('stays quiet once the level already allows regular evenings', async () => {
    mockApplications([application({ game_level: 'club' })]);
    render(<NoviceDevelopmentCRM />);
    await waitFor(() => expect(screen.getByText('Лиса')).toBeTruthy());
    expect(screen.queryByText(/Смени уровень/)).toBeNull();
  });
});
