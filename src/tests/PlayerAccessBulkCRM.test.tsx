/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const players = [
  { id: 'a', nickname: 'Стаут', game_level: 'club', club_role: 'member', attendance_count: 2, organize_formats: null },
  { id: 'b', nickname: 'Точка', game_level: 'club', club_role: 'team', attendance_count: 9, organize_formats: 'CUSTOM' },
  { id: 'c', nickname: 'Аня', game_level: 'novice', club_role: 'member', attendance_count: 0, organize_formats: null, contact_status: 'paused', pause_reason: 'Исключён из рассылки организатором' },
];
const bulk = vi.fn(async () => ({ success: true, updated: 1 }));
vi.mock('../lib/api.ts', () => ({ api: { getPlayers: vi.fn(async () => players), bulkUpdatePlayerAccess: bulk } }));

const { PlayerAccessBulkCRM } = await import('../components/crm/PlayerAccessBulkCRM.tsx');
const names = () => screen.getAllByTestId('crm-access-bulk-row').map((row) => row.querySelector('strong')?.textContent);

describe('«Уровни и роли»', () => {
  afterEach(() => { cleanup(); bulk.mockClear(); });

  it('filters by role and sorts by visits', async () => {
    render(<PlayerAccessBulkCRM />);
    await screen.findByText('Стаут');
    expect(names()).toEqual(['Аня', 'Стаут', 'Точка']);
    fireEvent.change(screen.getByLabelText('Порядок'), { target: { value: 'visits' } });
    expect(names()).toEqual(['Точка', 'Стаут', 'Аня']);
    fireEvent.click(screen.getByRole('button', { name: 'Проводят вечера · 1' }));
    expect(names()).toEqual(['Точка']);
    fireEvent.click(screen.getByRole('button', { name: 'Проводят вечера · 1' }));
    expect(names()).toHaveLength(3);
  });

  it('marks a pause set for another reason and filters by it', async () => {
    render(<PlayerAccessBulkCRM />);
    await screen.findByText('Аня');
    expect(screen.getByText(/Рассылка на паузе: Исключён из рассылки организатором/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Рассылка на паузе · 1' }));
    expect(names()).toEqual(['Аня']);
  });

  it('shows what will change, saves «Может проводить» and reports the result by the button', async () => {
    render(<PlayerAccessBulkCRM />);
    fireEvent.click(await screen.findByText('Стаут'));
    fireEvent.change(screen.getByLabelText('Может проводить: Турниры'), { target: { value: 'yes' } });
    expect(screen.getByTestId('crm-access-bulk-summary').textContent).toContain('может проводить: турниры');
    fireEvent.click(screen.getByRole('button', { name: 'Применить к 1' }));
    await waitFor(() => expect(bulk).toHaveBeenCalledWith({ player_ids: ['a'], organize_formats_add: ['TOURNAMENT'] }));
    expect((await screen.findByTestId('crm-access-bulk-toast')).textContent).toContain('Сохранено');
  });
});
