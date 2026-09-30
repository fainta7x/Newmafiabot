/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const players = [
  { id: 'a', nickname: 'Стаут', game_level: 'club', club_role: 'member', attendance_count: 2, organize_formats: null },
  { id: 'b', nickname: 'Точка', game_level: 'club', club_role: 'team', attendance_count: 9, organize_formats: 'CUSTOM' },
  { id: 'c', nickname: 'Аня', game_level: 'novice', club_role: 'member', attendance_count: 0, organize_formats: null, contact_status: 'paused', pause_reason: 'Исключён из рассылки организатором' },
  { id: 'd', nickname: 'Гость', game_level: 'tournament', club_role: 'guest', attendance_count: 1, organize_formats: null, from_other_city: 1 },
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
    expect(names()).toEqual(['Аня', 'Гость', 'Стаут', 'Точка']);
    fireEvent.change(screen.getByLabelText('Порядок'), { target: { value: 'visits' } });
    expect(names()).toEqual(['Точка', 'Стаут', 'Гость', 'Аня']);
    fireEvent.click(screen.getByRole('button', { name: 'Проводят вечера · 1' }));
    expect(names()).toEqual(['Точка']);
    fireEvent.click(screen.getByRole('button', { name: 'Проводят вечера · 1' }));
    expect(names()).toHaveLength(4);
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

  it('shows what the marked players have now instead of «Не менять»', async () => {
    render(<PlayerAccessBulkCRM />);
    fireEvent.click(await screen.findByText('Точка'));
    const panel = screen.getByTestId('crm-access-bulk-panel');
    expect(panel.textContent).not.toContain('Не менять');
    expect((screen.getByLabelText('Может проводить: Свои ивенты') as HTMLSelectElement).value).toBe('yes');
    expect((screen.getByLabelText('Может проводить: Турниры') as HTMLSelectElement).value).toBe('no');
    // Picking the value the player already has is not a change.
    fireEvent.change(screen.getByLabelText('Может проводить: Свои ивенты'), { target: { value: 'yes' } });
    expect(screen.queryByTestId('crm-access-bulk-summary')).toBeNull();
    // Players who differ show «Разное».
    fireEvent.click(screen.getByText('Стаут'));
    expect((screen.getByLabelText('Может проводить: Свои ивенты') as HTMLSelectElement).value).toBe('');
    expect(screen.getByTestId('crm-access-bulk-panel').textContent).toContain('Разное');
  });

  it('puts «Все» last and combines «Как ходят» with «Роль в клубе»', async () => {
    render(<PlayerAccessBulkCRM />);
    await screen.findByText('Стаут');
    const levelChips = screen.getByLabelText('Уровень игры').querySelectorAll('button');
    expect(levelChips[levelChips.length - 1].textContent).toContain('Все');
    fireEvent.click(screen.getByRole('button', { name: 'Ходят постоянно · 3' }));
    expect(names()).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Помогают клубу · 1' }));
    expect(names()).toEqual(['Точка']);
  });

  it('a player from another city gets only the level and rating judging', async () => {
    render(<PlayerAccessBulkCRM />);
    fireEvent.click(await screen.findByText('Гость'));
    expect(screen.getByTestId('crm-access-bulk-other-city')).toBeTruthy();
    expect(screen.getByTestId('crm-access-bulk-panel').textContent).not.toContain('Роль в клубе');
    expect(screen.queryByLabelText('Может вести: Клубные вечера')).toBeNull();
    expect(screen.getByLabelText('Может вести: Рейтинг и турниры')).toBeTruthy();
    expect(screen.queryByLabelText('Может проводить: Турниры')).toBeNull();
  });
});
