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

  it('warns about a player transferred earlier who still has the novice level', async () => {
    mockApplications([application({ status: 'CONVERTED' })]);
    const onOpenPlayer = vi.fn();
    render(<NoviceDevelopmentCRM onOpenPlayer={onOpenPlayer} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Все' }));
    await waitFor(() => expect(screen.getByText(/на обычные вечера запись закрыта/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Открыть карточку игрока' }));
    expect(onOpenPlayer).toHaveBeenCalledWith('p1');
  });

  it('stays quiet before the transfer and once the level allows regular evenings', async () => {
    mockApplications([application({}), application({ id: 'a2', status: 'CONVERTED', game_level: 'club' })]);
    render(<NoviceDevelopmentCRM />);
    fireEvent.click(await screen.findByRole('button', { name: 'Все' }));
    await waitFor(() => expect(screen.getAllByText('Лиса').length).toBeGreaterThan(0));
    expect(screen.queryByText(/Смени уровень/)).toBeNull();
  });
});
