// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { api } from '../lib/api.ts';
import { PlayersCRM } from '../components/crm/PlayersCRM.tsx';

vi.mock('../lib/api.ts', async () => {
  const actual = await vi.importActual<typeof import('../lib/api.ts')>('../lib/api.ts');
  return {
    ...actual,
    api: {
      ...actual.api,
      getPlayers: vi.fn(),
      getPlayer: vi.fn(),
    },
  };
});

describe('PlayersCRM embedded player card', () => {
  beforeEach(() => {
    vi.mocked(api.getPlayers).mockResolvedValue([]);
    vi.mocked(api.getPlayer).mockResolvedValue({
      id: 'player-1',
      nickname: 'Тестовый игрок',
      contact_status: 'normal',
      engagement_stage: 'regular',
      futureBookings: [],
      clubGames: [],
      tournamentGames: [],
      activities: [],
      eveningHistory: [],
      tasks: [],
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads only the selected player instead of reloading the full list', async () => {
    render(
      <PlayersCRM
        evenings={[]}
        onOpenEvening={() => undefined}
        selectedPlayerId="player-1"
      />,
    );

    await waitFor(() => expect(api.getPlayer).toHaveBeenCalledWith('player-1'));
    expect(api.getPlayers).not.toHaveBeenCalled();
  });
});
