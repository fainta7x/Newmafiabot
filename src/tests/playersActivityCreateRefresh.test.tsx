/** @vitest-environment jsdom */
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
      createPlayer: vi.fn(),
    },
  };
});

vi.mock('../components/crm/PlayersCRM.tsx', () => ({ PlayersCRM: () => null }));

describe('PlayersActivityCRM manual player creation', () => {
  beforeEach(() => {
    vi.mocked(api.getPlayers).mockResolvedValue([]);
    vi.mocked(api.createPlayer).mockResolvedValue({ id: 'new-player' } as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('refreshes the currently visible list after a player is created', async () => {
    render(<PlayersActivityCRM evenings={[]} onOpenEvening={() => undefined} />);
    await waitFor(() => expect(api.getPlayers).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Вся база' }));
    await waitFor(() => expect(api.getPlayers).toHaveBeenCalledWith({}));
    vi.mocked(api.getPlayers).mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }));
    fireEvent.change(screen.getByPlaceholderText('Никнейм *'), { target: { value: 'Новый игрок' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить игрока' }));

    await waitFor(() => expect(api.createPlayer).toHaveBeenCalled());
    await waitFor(() => expect(api.getPlayers).toHaveBeenCalledWith({}));
  });
});
