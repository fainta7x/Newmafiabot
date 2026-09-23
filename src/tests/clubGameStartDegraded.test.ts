import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseWrapper } from '../db/index.ts';

const mocks = vi.hoisted(() => ({
  getBetPoolByGame: vi.fn(),
  openBetPoolForGame: vi.fn(),
  parseRoleSnapshot: vi.fn(() => []),
  notifyBettingSpectators: vi.fn(),
}));

vi.mock('../server/services/bettingPoolService.ts', () => ({
  getBetPoolByGame: mocks.getBetPoolByGame,
  openBetPoolForGame: mocks.openBetPoolForGame,
  parseRoleSnapshot: mocks.parseRoleSnapshot,
}));
vi.mock('../server/services/bettingNotificationService.ts', () => ({
  notifyBettingSpectators: mocks.notifyBettingSpectators,
}));

import { startClubGameLifecycle } from '../server/services/clubGameStartService.ts';

const db = {
  get: vi.fn(async () => ({ id: 42, evening_id: 'evening', judge_player_id: 'judge', archived_at: null })),
} as unknown as DatabaseWrapper;

describe('club game betting degraded states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LIVE_BETTING_ENABLED;
  });

  afterEach(() => {
    delete process.env.LIVE_BETTING_ENABLED;
  });

  it('starts a game hosted by an external judge without betting instead of failing', async () => {
    const externalJudgeDb = {
      get: vi.fn(async () => ({ id: 43, evening_id: 'evening', judge_player_id: null, archived_at: null })),
    } as unknown as DatabaseWrapper;

    await expect(startClubGameLifecycle(externalJudgeDb, { gameId: 43, roles: [] })).resolves.toMatchObject({
      pool: null,
      disabled: true,
      betting_status: 'disabled',
      notification: { reason: 'external_judge' },
    });
    expect(mocks.openBetPoolForGame).not.toHaveBeenCalled();
  });

  it('reports a pool failure without failing the canonical game start request', async () => {
    mocks.getBetPoolByGame.mockRejectedValueOnce(new Error('Turso unavailable'));

    await expect(startClubGameLifecycle(db, { gameId: 42, roles: [] })).resolves.toMatchObject({
      pool: null,
      degraded: true,
      betting_status: 'pool_failed',
      notification: { reason: 'pool_initialization_failed' },
    });
  });

  it('keeps an opened pool usable when notification preparation fails', async () => {
    const pool = { id: 'pool-42', game_id: 42, game_number: 18, closes_at: new Date().toISOString(), judge_player_id: 'judge', role_snapshot_json: '[]' };
    mocks.getBetPoolByGame.mockResolvedValueOnce(null);
    mocks.openBetPoolForGame.mockResolvedValueOnce(pool);
    mocks.notifyBettingSpectators.mockRejectedValueOnce(new Error('outbox unavailable'));

    await expect(startClubGameLifecycle(db, { gameId: 42, roles: [] })).resolves.toMatchObject({
      pool,
      created: true,
      degraded: true,
      betting_status: 'notification_failed',
      notification: { reason: 'notification_preparation_failed' },
    });
  });
});
