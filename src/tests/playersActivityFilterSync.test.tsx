/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api } from '../lib/api.ts';
import { PlayersActivityCRM } from '../components/crm/PlayersActivityCRM.tsx';

vi.mock('../lib/api.ts', async () => {
  const actual = await vi.importActual<typeof import('../lib/api.ts')>('../lib/api.ts');
  return {
    ...actual,
    api: {
      ...actual.api,
      getPlayers: vi.fn(),
    },
  };
});

vi.mock('../components/crm/PlayersCRM.tsx', () => ({
  PlayersCRM: () => null,
}));

describe('PlayersActivityCRM filter source switching', () => {
  beforeEach(() => {
    vi.mocked(api.getPlayers).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('clears an exact activity filter when a quick segment is selected', async () => {
    render(<PlayersActivityCRM evenings={[]} onOpenEvening={() => undefined} />);

    await waitFor(() => expect(api.getPlayers).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }));
    const activitySelect = screen.getByRole('combobox', { name: 'Активность' }) as HTMLSelectElement;
    fireEvent.change(activitySelect, { target: { value: 'newcomer' } });

    await waitFor(() => expect(api.getPlayers).toHaveBeenCalledWith({ lifecycle_status: 'newcomer' }));

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Фильтры игроков' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Активные' }).getAttribute('aria-pressed')).toBe('false');

    vi.mocked(api.getPlayers).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Лояльные' }));

    await waitFor(() => expect(api.getPlayers).toHaveBeenCalledWith({ lifecycle_status: 'regular' }));
    expect(screen.getByRole('button', { name: 'Лояльные' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/самые постоянные/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Фильтры' }));
    const resetActivitySelect = screen.getByRole('combobox', { name: 'Активность' }) as HTMLSelectElement;
    expect(resetActivitySelect.value).toBe('');
  });
});
